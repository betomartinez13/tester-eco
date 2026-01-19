import { optimism, base, arbitrum } from 'viem/chains';
import type { Chain } from 'viem';

export type SupportedChainName = 'optimism' | 'base' | 'arbitrum';

export interface ChainConfig {
  name: SupportedChainName;
  chain: Chain;
  chainId: number;
}

export const CHAIN_CONFIGS: Record<SupportedChainName, ChainConfig> = {
  optimism: { name: 'optimism', chain: optimism, chainId: 10 },
  base: { name: 'base', chain: base, chainId: 8453 },
  arbitrum: { name: 'arbitrum', chain: arbitrum, chainId: 42161 },
};

export const SUPPORTED_ROUTES = [
  { source: 'optimism' as const, destination: 'base' as const },
  { source: 'optimism' as const, destination: 'arbitrum' as const },
];
