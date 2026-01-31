/**
 * Chain Utilities
 *
 * Helper functions for working with blockchain chains from the solver API
 */

import type { Address } from 'viem';
import type { BlockchainChain } from '../clients/solver-client.js';
import type { SupportedChainName } from '../config/chains.js';

/**
 * Map chain name from API to internal chain name format
 */
export function mapChainName(apiChainName: string): SupportedChainName | null {
  const nameMap: Record<string, SupportedChainName> = {
    'OP Mainnet': 'optimism',
    'Base': 'base',
    'Arbitrum One': 'arbitrum',
    'Solana': 'solana',
    'Ethereum': 'ethereum',
    'Polygon': 'polygon',
    'Ronin': 'ronin',
    'Ink': 'ink',
  };

  return nameMap[apiChainName] || null;
}

/**
 * Extract USDC token addresses from blockchain chains
 */
export function extractUsdcAddresses(
  chains: BlockchainChain[]
): Record<SupportedChainName, Address> {
  const usdcAddresses: Partial<Record<SupportedChainName, Address>> = {};

  for (const chain of chains) {
    const chainName = mapChainName(chain.chainName);
    if (!chainName) continue;

    // Find USDC token
    const usdc = chain.tokens.find(
      (t) => t.symbol === 'USDC' || t.symbol === 'USDC.e'
    );

    if (usdc) {
      usdcAddresses[chainName] = usdc.address as Address;
    }
  }

  return usdcAddresses as Record<SupportedChainName, Address>;
}

/**
 * Get list of supported chain names from API chains
 */
export function getSupportedChainNames(chains: BlockchainChain[]): SupportedChainName[] {
  return chains
    .map((chain) => mapChainName(chain.chainName))
    .filter((name): name is SupportedChainName => name !== null);
}

/**
 * Get chain by internal name
 */
export function getChainByName(
  chains: BlockchainChain[],
  chainName: SupportedChainName
): BlockchainChain | undefined {
  return chains.find((chain) => mapChainName(chain.chainName) === chainName);
}
