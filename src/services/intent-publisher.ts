/**
 * Intent Publisher Service
 *
 * Main service for publishing intents across different blockchain types.
 * Routes to the appropriate publisher (EVM, SVM) based on chain type.
 */

import type { IntentData } from '../types/intent.js';
import { getPublisherForChain } from '../publishers/publisher-factory.js';
import type { SupportedChainName } from '../config/chains.js';

// Re-export PublishResult for backward compatibility
export type { PublishResult } from '../publishers/base-publisher.js';

/**
 * Intent Publisher
 *
 * Delegates to chain-specific publishers via factory pattern
 */
export class IntentPublisher {
  /**
   * Publish and fund an intent using the appropriate publisher
   * Note: Quote must be fetched BEFORE calling this function
   *
   * @param data - Intent data with quote information
   * @returns Publishing result with intent hash and transaction details
   */
  async publishAndFund(data: IntentData) {
    // Get the appropriate publisher for the source chain
    const publisher = getPublisherForChain(data.sourceChain as SupportedChainName);

    // Delegate to chain-specific publisher
    return publisher.publishAndFund(data);
  }
}

/**
 * Get IntentPublisher instance
 * Maintains backward compatibility with existing code
 */
export function getIntentPublisher(): IntentPublisher {
  return new IntentPublisher();
}
