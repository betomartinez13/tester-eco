/**
 * Solana Transaction Building and Submission
 *
 * Handles building funding transactions and sending them to the Solana blockchain.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  type Keypair,
} from '@solana/web3.js';
import BN from 'bn.js';
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { hexToBytes32Array } from '../../config/portal.idl.js';
import { getPortalIdl } from '../../config/portal.idl.js';
import type { PublishContext, TransactionResult, SvmError } from './svm-types.js';
import { SvmErrorType } from './svm-types.js';
import { SVM_ERROR_MESSAGES, SVM_LOG_MESSAGES, SVM_CONFIRMATION_CONFIG } from './svm-constants.js';
import { AddressNormalizer } from '../../utils/address-normalizer.js';
import { ChainType } from '../../types/chain.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('SvmTransaction');

/**
 * Execute funding transaction for an intent
 */
export async function executeFunding(
  context: PublishContext
): Promise<TransactionResult> {
  try {
    log.info({ intentHash: context.intentHash }, SVM_LOG_MESSAGES.FUNDING_INTENT);

    // Setup Anchor program
    const program = setupAnchorProgram(context);

    // Build funding transaction
    const transaction = await buildFundingTransaction(program, context);

    // Send and confirm transaction
    const signature = await sendAndConfirmTransaction(
      context.connection,
      transaction,
      context.keypair
    );

    log.info({ signature, intentHash: context.intentHash }, SVM_LOG_MESSAGES.FUNDING_CONFIRMED);

    return {
      success: true,
      signature,
      intentHash: context.intentHash,
    };
  } catch (error: any) {
    log.error({ error, intentHash: context.intentHash }, 'Funding transaction failed');
    throw error;
  }
}

/**
 * Setup Anchor program instance
 */
function setupAnchorProgram(context: PublishContext): Program {
  // Create a wallet interface for Anchor
  const wallet = {
    publicKey: context.keypair.publicKey,
    signTransaction: async (tx: Transaction) => {
      tx.partialSign(context.keypair);
      return tx;
    },
    signAllTransactions: async (txs: Transaction[]) => {
      txs.forEach(tx => tx.partialSign(context.keypair));
      return txs;
    },
  };

  // Create Anchor provider
  const provider = new AnchorProvider(context.connection, wallet as any, {
    commitment: 'finalized',
    preflightCommitment: 'confirmed',
  });

  // Get Portal program address from context (comes from solver API as Base58)
  // No need to denormalize - solver returns native Base58 format
  const portalAddress = context.portalAddress;

  // Create program instance with IDL
  const idl = getPortalIdl(portalAddress);
  const program = new Program(idl, provider);

  return program;
}

/**
 * Build funding transaction
 */
async function buildFundingTransaction(
  program: Program,
  context: PublishContext
): Promise<Transaction> {
  const connection = context.connection;
  const payer = context.keypair.publicKey;

  // Derive vault PDA (Program Derived Address)
  // Vault PDA = findProgramAddress([b"vault", intentHash], programId)
  const intentHashBuffer = Buffer.from(context.intentHash.slice(2), 'hex'); // Remove 0x prefix
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), intentHashBuffer],
    program.programId
  );

  log.info({ vaultPda: vaultPda.toString(), intentHash: context.intentHash }, 'Derived vault PDA');

  // Get token mint from reward
  const tokenAddress = context.reward.tokens[0].token;
  const tokenMint = new PublicKey(
    AddressNormalizer.denormalize(tokenAddress as any, ChainType.SVM)
  );

  log.info({ tokenMint: tokenMint.toString() }, 'Token mint address');

  // Get funder's associated token account
  const funderTokenAccount = await getAssociatedTokenAddress(
    tokenMint,
    payer,
    false, // Not allowing owner off curve for user wallets
    TOKEN_PROGRAM_ID
  );

  // Get vault's associated token account
  const vaultTokenAccount = await getAssociatedTokenAddress(
    tokenMint,
    vaultPda,
    true, // Allow owner off curve for PDA
    TOKEN_PROGRAM_ID
  );

  log.info({
    funderTokenAccount: funderTokenAccount.toString(),
    vaultTokenAccount: vaultTokenAccount.toString(),
  }, 'Derived token accounts');

  // Prepare remaining accounts for token transfers
  const remainingAccounts = [
    { pubkey: tokenMint, isWritable: false, isSigner: false },
    { pubkey: funderTokenAccount, isWritable: true, isSigner: false },
    { pubkey: vaultTokenAccount, isWritable: true, isSigner: false },
  ];

  // Convert reward to Anchor format (using BN for numbers)
  const anchorReward = {
    deadline: new BN(context.reward.deadline),
    creator: new PublicKey(
      AddressNormalizer.denormalize(context.reward.creator as any, ChainType.SVM)
    ),
    prover: new PublicKey(
      AddressNormalizer.denormalize(context.reward.prover as any, ChainType.SVM)
    ),
    nativeAmount: new BN(context.reward.nativeAmount),
    tokens: context.reward.tokens.map(token => ({
      token: new PublicKey(
        AddressNormalizer.denormalize(token.token as any, ChainType.SVM)
      ),
      amount: new BN(token.amount),
    })),
  };

  // Convert route hash to Bytes32 format (array of 32 bytes)
  const routeHashBytes = hexToBytes32Array(context.routeHash);

  // Build fund instruction
  const transaction = await program.methods
    .fund({
      destination: new BN(context.destination.toString()),
      routeHash: routeHashBytes,
      reward: anchorReward,
      allowPartial: false,
    })
    .accounts({
      payer,
      funder: payer,
      vault: vaultPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(remainingAccounts)
    .transaction();

  return transaction;
}

/**
 * Send transaction and wait for confirmation
 */
async function sendAndConfirmTransaction(
  connection: Connection,
  transaction: Transaction,
  signer: Keypair
): Promise<string> {
  try {
    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = signer.publicKey;

    // Sign transaction
    transaction.sign(signer);

    // Send transaction
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: SVM_CONFIRMATION_CONFIG.SKIP_PREFLIGHT,
      preflightCommitment: SVM_CONFIRMATION_CONFIG.PREFLIGHT_COMMITMENT,
      maxRetries: SVM_CONFIRMATION_CONFIG.MAX_SEND_RETRIES,
    });

    log.info({ signature }, SVM_LOG_MESSAGES.TX_SIGNATURE(signature));

    // Wait for confirmation
    await waitForTransactionConfirmation(connection, signature);

    return signature;
  } catch (error: any) {
    log.error({ error }, 'Transaction submission failed');
    throw new Error(`${SVM_ERROR_MESSAGES.TRANSACTION_FAILED}: ${error.message}`);
  }
}

/**
 * Wait for transaction confirmation with polling
 */
async function waitForTransactionConfirmation(
  connection: Connection,
  signature: string
): Promise<void> {
  const maxRetries = SVM_CONFIRMATION_CONFIG.MAX_CONFIRMATION_RETRIES;
  const interval = SVM_CONFIRMATION_CONFIG.CONFIRMATION_POLLING_INTERVAL_MS;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const result = await connection.getSignatureStatus(signature, {
        searchTransactionHistory: true,
      });

      const status = result?.value;

      if (status?.confirmationStatus === 'finalized' || status?.confirmationStatus === 'confirmed') {
        if (status.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
        }
        log.info({ status: status.confirmationStatus }, SVM_LOG_MESSAGES.TX_CONFIRMED(status.confirmationStatus));
        return;
      }

      if (status?.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
      }
    } catch (error: any) {
      if (retries === maxRetries - 1) {
        throw error;
      }
    }

    await new Promise(resolve => setTimeout(resolve, interval));
    retries++;
  }

  throw new Error(SVM_ERROR_MESSAGES.CONFIRMATION_TIMEOUT(maxRetries));
}
