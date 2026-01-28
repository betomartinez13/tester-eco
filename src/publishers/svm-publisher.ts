/**
 * SVM Publisher
 *
 * Intent publishing implementation for Solana (SVM) chains.
 * Handles intent publishing and funding using Solana Portal program.
 */

import type { Hash } from 'viem';
import { getSolanaConnection, getSolanaKeypair, getSolanaBalance } from '../clients/svm-client.js';
import { BasePublisher, type PublishResult } from './base-publisher.js';
import type { IntentData } from '../types/intent.js';
import { getChainId, type SupportedChainName } from '../config/chains.js';
import { createChildLogger } from '../utils/logger.js';
import { executeFunding } from './svm/svm-transaction.js';
import type { PublishContext } from './svm/svm-types.js';
import { SvmError, SvmErrorType } from './svm/svm-types.js';
import { SVM_ERROR_MESSAGES } from './svm/svm-constants.js';
import { getIntentHashFromReward } from '../utils/portal-hash.js';
import { AddressNormalizer } from '../utils/address-normalizer.js';
import { ChainType } from '../types/chain.js';
import type { UniversalAddress } from '../types/universal-address.js';

const log = createChildLogger('SvmPublisher');

/**
 * Solana-specific intent publisher
 * Handles SPL token approvals and Portal program interactions
 */
export class SvmPublisher extends BasePublisher {
  /**
   * Publish and fund an intent using Portal program
   * Note: Quote must be fetched BEFORE calling this function
   */
  async publishAndFund(data: IntentData): Promise<PublishResult> {
    const connection = getSolanaConnection();
    const keypair = getSolanaKeypair();

    const { quote } = data;
    const { contracts } = quote;

    log.info({
      sourceChain: data.sourceChain,
      destinationChain: data.destinationChain,
      sourceAmount: quote.sourceAmount,
      destinationAmount: quote.destinationAmount,
    }, 'Publishing and funding Solana intent');

    // Get chain IDs
    const sourceChainId = BigInt(getChainId(data.sourceChain as SupportedChainName));
    const destinationChainId = BigInt(getChainId(data.destinationChain as SupportedChainName));

    // Normalize addresses to UniversalAddress format for hash calculation
    // Note: Solver returns Base58 strings for Solana addresses
    const sourceToken = AddressNormalizer.normalize(
      data.sourceToken,
      ChainType.SVM
    );

    const funder = AddressNormalizer.normalize(
      keypair.publicKey.toBase58(),
      ChainType.SVM
    );

    // Prover comes from solver as Base58, normalize to UniversalAddress
    const prover = AddressNormalizer.normalize(
      contracts.prover,
      ChainType.SVM
    );

    // Build reward structure for hash calculation
    const rewardForHash = {
      deadline: BigInt(quote.deadline),
      creator: funder,
      prover,
      nativeAmount: '0', // No native SOL reward
      tokens: [
        {
          token: sourceToken,
          amount: quote.sourceAmount,
        },
      ],
    };

    // Calculate intent hash, route hash, and reward hash
    const { intentHash, routeHash, rewardHash } = getIntentHashFromReward(
      sourceChainId,
      destinationChainId,
      quote.encodedRoute,
      rewardForHash
    );

    log.info({
      intentHash,
      routeHash,
      rewardHash,
    }, 'Calculated intent hashes');

    // Build publish context (using string types for addresses)
    const context: PublishContext = {
      connection,
      keypair,
      intentHash,
      routeHash,
      rewardHash,
      destination: destinationChainId,
      encodedRoute: quote.encodedRoute,
      reward: {
        deadline: BigInt(quote.deadline),
        creator: funder as string,
        prover: prover as string,
        nativeAmount: '0',
        tokens: [
          {
            token: sourceToken as string,
            amount: quote.sourceAmount,
          },
        ],
      },
      portalAddress: contracts.sourcePortal,
    };

    // Execute funding transaction
    const result = await executeFunding(context);

    if (!result.success) {
      throw new SvmError(
        SvmErrorType.TRANSACTION_FAILED,
        SVM_ERROR_MESSAGES.FUNDING_FAILED
      );
    }

    log.info({
      intentHash: result.intentHash,
      signature: result.signature,
    }, 'Solana intent published and funded successfully');

    return {
      intentHash: result.intentHash!,
      txHash: result.signature as Hash,
      sourcePortal: contracts.sourcePortal,
      destinationPortal: contracts.destinationPortal,
      prover: contracts.prover,
    };
  }

  /**
   * Get SOL balance for an address
   */
  async getBalance(address: string): Promise<bigint> {
    try {
      return await getSolanaBalance(address);
    } catch (error) {
      log.error({ address, error }, 'Failed to get SOL balance');
      return 0n;
    }
  }
}
