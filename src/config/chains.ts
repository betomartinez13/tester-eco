import { optimism, base, arbitrum, mainnet, polygon, type Chain } from 'viem/chains';
import { ChainType, type BaseChainConfig } from '../types/chain.js';
import { getConfig } from './index.js';

export type SupportedChainName =
  | 'optimism'
  | 'base'
  | 'arbitrum'
  | 'solana'
  | 'ethereum'
  | 'polygon'
  | 'ronin'
  | 'ink';

/**
 * Custom chain definitions for chains not in viem
 */
export const ronin: Chain = {
  id: 2020,
  name: 'Ronin',
  nativeCurrency: { name: 'RON', symbol: 'RON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://api.roninchain.com/rpc'] },
  },
  blockExplorers: {
    default: { name: 'Ronin Explorer', url: 'https://app.roninchain.com' },
  },
};

export const ink: Chain = {
  id: 57073,
  name: 'Ink',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc-gel-sepolia.inkonchain.com'] },
  },
  blockExplorers: {
    default: { name: 'Ink Explorer', url: 'https://explorer-sepolia.inkonchain.com' },
  },
};

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
  ethereum: mainnet,
  polygon,
  ronin,
  ink,
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
    ethereum: {
      id: BigInt(mainnet.id),
      name: mainnet.name,
      type: ChainType.EVM,
      rpcUrl: config.ethereumRpcUrl,
      viemChain: mainnet,
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
    },
    polygon: {
      id: BigInt(polygon.id),
      name: polygon.name,
      type: ChainType.EVM,
      rpcUrl: config.polygonRpcUrl,
      viemChain: polygon,
      nativeCurrency: {
        name: 'MATIC',
        symbol: 'MATIC',
        decimals: 18,
      },
    },
    ronin: {
      id: BigInt(ronin.id),
      name: ronin.name,
      type: ChainType.EVM,
      rpcUrl: config.roninRpcUrl,
      viemChain: ronin,
      nativeCurrency: {
        name: 'RON',
        symbol: 'RON',
        decimals: 18,
      },
    },
    ink: {
      id: BigInt(ink.id),
      name: ink.name,
      type: ChainType.EVM,
      rpcUrl: config.inkRpcUrl,
      viemChain: ink,
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
    },
  };
}

/**
 * Helper to get chain ID from chain name
 */
export function getChainId(chainName: SupportedChainName): number {
  const chainIdMap: Record<SupportedChainName, number> = {
    optimism: 10,
    base: 8453,
    arbitrum: 42161,
    solana: 1399811149,
    ethereum: 1,
    polygon: 137,
    ronin: 2020,
    ink: 57073,
  };
  return chainIdMap[chainName];
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
