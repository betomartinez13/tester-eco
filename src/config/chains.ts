import { optimism, base, arbitrum, type Chain } from 'viem/chains';

export type SupportedChainName = 'optimism' | 'base' | 'arbitrum';

/**
 * Supported chains - using viem's built-in chain definitions
 */
export const CHAINS: Record<SupportedChainName, Chain> = {
  optimism,
  base,
  arbitrum,
};

/**
 * Helper to get chain ID from chain name
 */
export function getChainId(chainName: SupportedChainName): number {
  return CHAINS[chainName].id;
}

export const SUPPORTED_ROUTES = [
  { source: 'optimism' as const, destination: 'base' as const },
  { source: 'optimism' as const, destination: 'arbitrum' as const },
];
