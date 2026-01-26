import { optimism, base, arbitrum, type Chain } from 'viem/chains';
import { ChainType, type BaseChainConfig } from '../types/chain.js';
import { getConfig } from './index.js';

export type SupportedChainName = 'optimism' | 'base' | 'arbitrum' | 'solana';

/**
 * Extended chain configuration with type support
 */
export interface ChainConfig extends BaseChainConfig {
  viemChain?: Chain; // Optional: only for EVM chains
}

/**
 * Supported chains - using viem's built-in chain definitions for EVM
 */
export const CHAINS: Record<SupportedChainName, Chain> = {
  optimism,
  base,
  arbitrum,
} as any; // Type assertion needed due to Solana addition

/**
 * All chain configurations (EVM + SVM)
 */
export function getChainConfigs(): Record<SupportedChainName, ChainConfig> {
  const config = getConfig();

  return {
    optimism: {
      id: BigInt(optimism.id),
      name: optimism.name,
      type: ChainType.EVM,
      rpcUrl: config.optimismRpcUrl,
      viemChain: optimism,
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
    },
    base: {
      id: BigInt(base.id),
      name: base.name,
      type: ChainType.EVM,
      rpcUrl: config.baseRpcUrl,
      viemChain: base,
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
    },
    arbitrum: {
      id: BigInt(arbitrum.id),
      name: arbitrum.name,
      type: ChainType.EVM,
      rpcUrl: config.arbitrumRpcUrl,
      viemChain: arbitrum,
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
    },
    solana: {
      id: 1399811149n,
      name: 'Solana',
      type: ChainType.SVM,
      rpcUrl: config.solanaRpcUrl,
      nativeCurrency: {
        name: 'Solana',
        symbol: 'SOL',
        decimals: 9,
      },
    },
  };
}

/**
 * Helper to get chain ID from chain name
 */
export function getChainId(chainName: SupportedChainName): number {
  if (chainName === 'solana') {
    return 1399811149;
  }
  return CHAINS[chainName].id;
}

/**
 * Helper to get chain config by name
 */
export function getChainConfig(chainName: SupportedChainName): ChainConfig {
  return getChainConfigs()[chainName];
}

export const SUPPORTED_ROUTES = [
  { source: 'optimism' as const, destination: 'base' as const },
  { source: 'optimism' as const, destination: 'arbitrum' as const },
  // Solana routes will be added after testing
  // { source: 'solana' as const, destination: 'optimism' as const },
  // { source: 'optimism' as const, destination: 'solana' as const },
];
