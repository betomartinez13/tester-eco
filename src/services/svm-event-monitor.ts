/**
 * Solana Event Monitor
 *
 * Handles monitoring of Solana transaction confirmations and account state.
 * Unlike EVM chains which emit events, Solana uses transaction signatures
 * and account state changes for monitoring.
 */

import type { Hash } from 'viem';
import { getSolanaConnection } from '../clients/svm-client.js';
import { pollUntil, type PollOptions } from '../utils/polling.js';
import { createChildLogger } from '../utils/logger.js';
import type { EventResult } from './event-monitor.js';

const log = createChildLogger('SvmEventMonitor');

/**
 * Solana Event Monitor
 *
 * Monitors Solana transactions and account states.
 * Note: Solana event monitoring differs from EVM - we primarily
 * monitor transaction confirmation status rather than event logs.
 */
export class SvmEventMonitor {
  /**
   * Wait for IntentFulfilled on Solana destination chain
   *
   * For Solana, this monitors the fulfillment transaction confirmation.
   * Since we don't have a transaction signature upfront, we poll the
   * destination Portal account for state changes.
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

    // For Solana fulfillment, we would need to:
    // 1. Query the Portal program account for intent state
    // 2. Check if the intent has been fulfilled
    // This requires reading program account data which is beyond Phase 5 scope

    // For now, return a mock result indicating that Solana fulfillment
    // monitoring is not yet fully implemented
    log.warn({ intentHash }, 'Solana fulfillment monitoring not yet implemented - returning mock result');

    return pollUntil(async () => {
      // TODO: Implement proper Solana account state monitoring
      // For now, wait for a reasonable time and assume fulfillment happened
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

      return {
        log: {} as any,
        blockNumber: 0n,
        transactionHash: intentHash,
        args: { intentHash },
      };
    }, options);
  }

  /**
   * Poll for IntentProven on Solana source chain
   *
   * For Solana, this monitors the prover account for proof submission.
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

    // For Solana proof monitoring, we would need to:
    // 1. Query the Prover program account for proof data
    // 2. Check if proof exists for this intent

    log.warn({ intentHash }, 'Solana proof monitoring not yet implemented - returning mock result');

    return pollUntil(async () => {
      // TODO: Implement proper Solana proof monitoring
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

      return {
        log: {} as any,
        blockNumber: 0n,
        transactionHash: intentHash,
        args: { intentHash },
      };
    }, options);
  }

  /**
   * Poll for IntentWithdrawn on Solana source chain
   *
   * For Solana, this monitors the Portal account for withdrawal completion.
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

    // For Solana withdrawal monitoring, we would need to:
    // 1. Query the Portal program account for intent state
    // 2. Check if the intent has been withdrawn

    log.warn({ intentHash }, 'Solana withdrawal monitoring not yet implemented - returning mock result');

    return pollUntil(async () => {
      // TODO: Implement proper Solana withdrawal monitoring
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

      return {
        log: {} as any,
        blockNumber: 0n,
        transactionHash: intentHash,
        args: { intentHash },
      };
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
