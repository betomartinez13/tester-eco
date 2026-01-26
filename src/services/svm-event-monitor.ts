/**
 * Solana Event Monitor
 *
 * Handles monitoring of Solana transaction confirmations and account state.
 * Unlike EVM chains which emit events, Solana uses account state changes
 * to track intent lifecycle (FulfillMarker, WithdrawnMarker accounts).
 */

import { PublicKey } from '@solana/web3.js';
import type { Hash } from 'viem';
import { getSolanaConnection } from '../clients/svm-client.js';
import { pollUntil, type PollOptions } from '../utils/polling.js';
import { createChildLogger } from '../utils/logger.js';
import type { EventResult } from './event-monitor.js';

const log = createChildLogger('SvmEventMonitor');

// Seeds for Portal program PDAs (from portal/src/state.rs)
const FULFILL_MARKER_SEED = Buffer.from('fulfill_marker');
const CLAIMED_MARKER_SEED = Buffer.from('claimed_marker');

// Seeds for Prover program PDAs (from eco-svm-std/src/prover.rs)
const PROOF_SEED = Buffer.from('proof');

/**
 * Solana Event Monitor
 *
 * Monitors Solana Portal program account states to track intent lifecycle.
 * Queries program-derived addresses (PDAs) to check if markers exist.
 */
export class SvmEventMonitor {
  /**
   * Wait for IntentFulfilled on Solana destination chain
   *
   * Checks for FulfillMarker account existence, which is created when
   * the solver fulfills an intent on Solana.
   *
   * @param intentHash - The intent hash to watch for
   * @param portalAddress - Portal program address
   * @param options - Polling options
   */
  async waitForFulfilled(
    intentHash: Hash,
    portalAddress: string,
    options: PollOptions
  ): Promise<EventResult | null> {
    log.info({ intentHash, portal: portalAddress }, 'Waiting for Solana IntentFulfilled');

    const connection = getSolanaConnection();
    const programId = new PublicKey(portalAddress);

    // Derive FulfillMarker PDA
    // PDA = findProgramAddress([b"fulfill_marker", intentHash], programId)
    const intentHashBuffer = Buffer.from(intentHash.slice(2), 'hex');
    const [fulfillMarkerPda] = PublicKey.findProgramAddressSync(
      [FULFILL_MARKER_SEED, intentHashBuffer],
      programId
    );

    log.info({ fulfillMarkerPda: fulfillMarkerPda.toString() }, 'Derived FulfillMarker PDA');

    return pollUntil(async () => {
      try {
        // Check if FulfillMarker account exists
        const accountInfo = await connection.getAccountInfo(fulfillMarkerPda);

        if (accountInfo !== null) {
          // Account exists = intent was fulfilled!
          log.info({ intentHash, fulfillMarker: fulfillMarkerPda.toString() }, 'Intent fulfilled on Solana');

          // Get the slot/block where this account was created
          const slot = await connection.getSlot();

          return {
            log: {} as any,
            blockNumber: BigInt(slot),
            transactionHash: intentHash,
            args: { intentHash, fulfillMarker: fulfillMarkerPda.toString() },
          };
        }

        // Account doesn't exist yet, keep polling
        return null;
      } catch (error: any) {
        log.error({ intentHash, error }, 'Error checking FulfillMarker account');
        return null; // Keep polling on error
      }
    }, options);
  }

  /**
   * Poll for IntentProven on Solana source chain
   *
   * Checks for Proof account existence, which is created when
   * the solver submits proof of fulfillment to the prover program.
   *
   * @param intentHash - The intent hash to watch for
   * @param proverAddress - Prover program address
   * @param options - Polling options
   */
  async pollForProven(
    intentHash: Hash,
    proverAddress: string,
    options: PollOptions
  ): Promise<EventResult | null> {
    log.info({ intentHash, prover: proverAddress }, 'Polling for Solana IntentProven');

    const connection = getSolanaConnection();
    const programId = new PublicKey(proverAddress);

    // Derive Proof PDA
    // PDA = findProgramAddress([b"proof", intentHash], programId)
    const intentHashBuffer = Buffer.from(intentHash.slice(2), 'hex');
    const [proofPda] = PublicKey.findProgramAddressSync(
      [PROOF_SEED, intentHashBuffer],
      programId
    );

    log.info({ proofPda: proofPda.toString() }, 'Derived Proof PDA');

    return pollUntil(async () => {
      try {
        // Check if Proof account exists
        const accountInfo = await connection.getAccountInfo(proofPda);

        if (accountInfo !== null) {
          // Account exists = proof was submitted!
          log.info({ intentHash, proofPda: proofPda.toString() }, 'Intent proven on Solana');

          // Get the slot/block where this account was created
          const slot = await connection.getSlot();

          return {
            log: {} as any,
            blockNumber: BigInt(slot),
            transactionHash: intentHash,
            args: { intentHash, proofPda: proofPda.toString() },
          };
        }

        // Account doesn't exist yet, keep polling
        return null;
      } catch (error: any) {
        log.error({ intentHash, error }, 'Error checking Proof account');
        return null; // Keep polling on error
      }
    }, options);
  }

  /**
   * Poll for IntentWithdrawn on Solana source chain
   *
   * Checks for WithdrawnMarker (ClaimedMarker) account existence, which is
   * created when the intent rewards are withdrawn on Solana.
   *
   * @param intentHash - The intent hash to watch for
   * @param portalAddress - Portal program address
   * @param options - Polling options
   */
  async pollForWithdrawn(
    intentHash: Hash,
    portalAddress: string,
    options: PollOptions
  ): Promise<EventResult | null> {
    log.info({ intentHash, portal: portalAddress }, 'Polling for Solana IntentWithdrawn');

    const connection = getSolanaConnection();
    const programId = new PublicKey(portalAddress);

    // Derive WithdrawnMarker (ClaimedMarker) PDA
    // PDA = findProgramAddress([b"claimed_marker", intentHash], programId)
    const intentHashBuffer = Buffer.from(intentHash.slice(2), 'hex');
    const [withdrawnMarkerPda] = PublicKey.findProgramAddressSync(
      [CLAIMED_MARKER_SEED, intentHashBuffer],
      programId
    );

    log.info({ withdrawnMarkerPda: withdrawnMarkerPda.toString() }, 'Derived WithdrawnMarker PDA');

    return pollUntil(async () => {
      try {
        // Check if WithdrawnMarker account exists
        const accountInfo = await connection.getAccountInfo(withdrawnMarkerPda);

        if (accountInfo !== null) {
          // Account exists = intent was withdrawn!
          log.info({ intentHash, withdrawnMarker: withdrawnMarkerPda.toString() }, 'Intent withdrawn on Solana');

          // Get the slot/block where this account was created
          const slot = await connection.getSlot();

          return {
            log: {} as any,
            blockNumber: BigInt(slot),
            transactionHash: intentHash,
            args: { intentHash, withdrawnMarker: withdrawnMarkerPda.toString() },
          };
        }

        // Account doesn't exist yet, keep polling
        return null;
      } catch (error: any) {
        log.error({ intentHash, error }, 'Error checking WithdrawnMarker account');
        return null; // Keep polling on error
      }
    }, options);
  }

  /**
   * Confirm a Solana transaction by signature
   *
   * This is the primary confirmation method for Solana.
   * Used after publishing/funding to confirm the transaction was successful.
   *
   * @param signature - Transaction signature
   * @param options - Polling options
   */
  async confirmTransaction(
    signature: string,
    options: PollOptions = { interval: 1000, timeout: 60000 }
  ): Promise<boolean> {
    log.info({ signature }, 'Confirming Solana transaction');

    const connection = getSolanaConnection();

    const result = await pollUntil(async () => {
      try {
        const result = await connection.getSignatureStatus(signature, {
          searchTransactionHistory: true,
        });

        const status = result?.value;

        if (status?.confirmationStatus === 'finalized' || status?.confirmationStatus === 'confirmed') {
          if (status.err) {
            log.error({ signature, error: status.err }, 'Transaction failed');
            throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
          }
          log.info({ signature, status: status.confirmationStatus }, 'Transaction confirmed');
          return true;
        }

        if (status?.err) {
          log.error({ signature, error: status.err }, 'Transaction failed');
          throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
        }

        return null; // Keep polling
      } catch (error: any) {
        log.error({ signature, error }, 'Error checking transaction status');
        throw error;
      }
    }, options);

    return result !== null;
  }
}

/**
 * Get SvmEventMonitor instance
 */
export function getSvmEventMonitor(): SvmEventMonitor {
  return new SvmEventMonitor();
}
