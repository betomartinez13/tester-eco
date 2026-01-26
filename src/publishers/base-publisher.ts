/**
 * Base Publisher Interface
 *
 * Abstract class defining the interface for intent publishing
 * across different blockchain types (EVM, SVM, etc.)
 */

import type { Hash } from 'viem';
import type { IntentData } from '../types/intent.js';

/**
 * Result of publishing an intent
 */
export interface PublishResult {
  intentHash: Hash;
  txHash: Hash;
  sourcePortal: string;
  destinationPortal: string;
  prover: string;
}

/**
 * Abstract base class for intent publishers
 * Each blockchain type (EVM, SVM) implements this interface
 */
export abstract class BasePublisher {
  /**
   * Publish and fund an intent
   *
   * @param intentData - Intent configuration with quote
   * @returns Publishing result with intent hash and transaction details
   */
  abstract publishAndFund(intentData: IntentData): Promise<PublishResult>;

  /**
   * Get native token balance for an address
   *
   * @param address - Wallet address
   * @returns Balance in smallest unit (wei for EVM, lamports for Solana)
   */
  abstract getBalance(address: string): Promise<bigint>;
}
