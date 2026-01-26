/**
 * Chain Type System
 *
 * Defines blockchain types and extended chain configuration
 * to support both EVM and SVM (Solana) chains.
 */

/**
 * Blockchain type enumeration
 * Identifies the virtual machine type for different blockchain networks
 */
export enum ChainType {
  /** Ethereum Virtual Machine chains (Ethereum, Optimism, Base, Arbitrum) */
  EVM = 'EVM',
  /** Solana Virtual Machine chains (Solana mainnet, devnet) */
  SVM = 'SVM',
}

/**
 * Extended chain configuration that supports both EVM and SVM chains
 */
export interface BaseChainConfig {
  id: bigint;
  name: string;
  type: ChainType;
  rpcUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}
