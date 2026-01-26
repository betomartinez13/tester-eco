/**
 * Publisher Factory
 *
 * Creates the appropriate publisher instance based on chain type
 */

import { ChainType } from '../types/chain.js';
import { getChainConfig, type SupportedChainName } from '../config/chains.js';
import { BasePublisher } from './base-publisher.js';
import { EvmPublisher } from './evm-publisher.js';
import { SvmPublisher } from './svm-publisher.js';

/**
 * Get the appropriate publisher for a chain
 *
 * @param chainName - Name of the source chain
 * @returns Publisher instance for that chain type
 */
export function getPublisherForChain(chainName: SupportedChainName): BasePublisher {
  const chainConfig = getChainConfig(chainName);

  switch (chainConfig.type) {
    case ChainType.EVM:
      return new EvmPublisher();

    case ChainType.SVM:
      return new SvmPublisher();

    default:
      throw new Error(`Unsupported chain type: ${chainConfig.type}`);
  }
}
