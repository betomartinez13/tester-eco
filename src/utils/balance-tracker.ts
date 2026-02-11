/**
 * Balance Tracker Utility
 *
 * Tracks USDC balances for users and solver wallets across EVM and Solana chains.
 * Used to verify that actual token transfers match expected intent amounts.
 */

import type { Address } from 'viem';
import { getPublicClient } from '../clients/evm-client.js';
import { getSplTokenBalance } from '../clients/svm-client.js';
import type { SupportedChainName } from '../config/chains.js';
import { ERC20_ABI } from '../config/abis/index.js';
import type { BlockchainChain } from '../clients/solver-client.js';

export interface BalanceSnapshot {
  chain: SupportedChainName;
  address: string;
  tokenAddress: string;
  balance: bigint;
  timestamp: number;
}

export interface BalanceChange {
  chain: SupportedChainName;
  address: string;
  label: string;
  before: bigint;
  after: bigint;
  change: bigint;
  expected: bigint;
  isCorrect: boolean;
}

/**
 * Get ERC20 token balance on an EVM chain
 */
async function getEvmTokenBalance(
  chainName: SupportedChainName,
  walletAddress: string,
  tokenAddress: string
): Promise<bigint> {
  try {
    const client = getPublicClient(chainName);
    const balance = await client.readContract({
      address: tokenAddress as Address,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [walletAddress as Address],
    });
    return balance as bigint;
  } catch (error) {
    console.warn(`Failed to get EVM balance for ${walletAddress} on ${chainName}:`, error);
    return 0n;
  }
}

/**
 * Get USDC balance for any chain (EVM or Solana)
 */
export async function getUsdcBalance(
  chainName: SupportedChainName,
  walletAddress: string,
  tokenAddress: string
): Promise<bigint> {
  if (chainName === 'solana') {
    return getSplTokenBalance(walletAddress, tokenAddress);
  }
  return getEvmTokenBalance(chainName, walletAddress, tokenAddress);
}

/**
 * Extract solver wallet addresses from blockchain chains API response
 */
export function extractSolverWallets(chains: BlockchainChain[]): Record<SupportedChainName, { basic: string; kernel?: string }> {
  const wallets: Record<string, { basic: string; kernel?: string }> = {};

  const chainNameMap: Record<string, SupportedChainName> = {
    'OP Mainnet': 'optimism',
    'Base': 'base',
    'Ronin': 'ronin',
    'Arbitrum One': 'arbitrum',
    'Ethereum': 'ethereum',
    'Polygon': 'polygon',
    'Ink': 'ink',
    'Solana': 'solana',
  };

  for (const chain of chains) {
    const name = chainNameMap[chain.chainName];
    if (name) {
      const basic = chain.wallets.find(w => w.type === 'basic')?.address || '';
      const kernel = chain.wallets.find(w => w.type === 'kernel')?.address;
      wallets[name] = { basic, kernel };
    }
  }

  return wallets as Record<SupportedChainName, { basic: string; kernel?: string }>;
}

/**
 * Format balance for display (USDC has 6 decimals)
 */
export function formatUsdc(amount: bigint): string {
  const value = Number(amount) / 1e6;
  return value.toFixed(6);
}

/**
 * Format balance change with +/- prefix
 */
export function formatChange(change: bigint): string {
  const value = Number(change) / 1e6;
  const prefix = change >= 0n ? '+' : '';
  return `${prefix}${value.toFixed(6)}`;
}

/**
 * Balance Tracker class for tracking balances throughout intent lifecycle
 */
export class BalanceTracker {
  private snapshots: Map<string, BalanceSnapshot> = new Map();
  private solverWallets: Record<SupportedChainName, { basic: string; kernel?: string }>;
  private usdcAddresses: Record<SupportedChainName, string>;

  constructor(
    solverWallets: Record<SupportedChainName, { basic: string; kernel?: string }>,
    usdcAddresses: Record<SupportedChainName, string>
  ) {
    this.solverWallets = solverWallets;
    this.usdcAddresses = usdcAddresses;
  }

  private getKey(chain: SupportedChainName, address: string, label: string): string {
    return `${chain}:${address}:${label}`;
  }

  /**
   * Take a balance snapshot
   */
  async snapshot(
    chain: SupportedChainName,
    address: string,
    label: string
  ): Promise<bigint> {
    const tokenAddress = this.usdcAddresses[chain];
    if (!tokenAddress) {
      console.warn(`No USDC address for chain ${chain}`);
      return 0n;
    }

    const balance = await getUsdcBalance(chain, address, tokenAddress);
    const key = this.getKey(chain, address, label);

    this.snapshots.set(key, {
      chain,
      address,
      tokenAddress,
      balance,
      timestamp: Date.now(),
    });

    return balance;
  }

  /**
   * Get previous snapshot
   */
  getSnapshot(chain: SupportedChainName, address: string, label: string): BalanceSnapshot | undefined {
    return this.snapshots.get(this.getKey(chain, address, label));
  }

  /**
   * Calculate and verify balance change
   */
  async verifyChange(
    chain: SupportedChainName,
    address: string,
    label: string,
    expectedChange: bigint
  ): Promise<BalanceChange> {
    const beforeKey = this.getKey(chain, address, `${label}_before`);
    const beforeSnapshot = this.snapshots.get(beforeKey);

    if (!beforeSnapshot) {
      throw new Error(`No 'before' snapshot found for ${label} on ${chain}`);
    }

    const tokenAddress = this.usdcAddresses[chain];
    const after = await getUsdcBalance(chain, address, tokenAddress);
    const change = after - beforeSnapshot.balance;

    // Allow small tolerance for rounding (1 unit = 0.000001 USDC)
    const tolerance = 1n;
    const isCorrect = change >= expectedChange - tolerance && change <= expectedChange + tolerance;

    return {
      chain,
      address,
      label,
      before: beforeSnapshot.balance,
      after,
      change,
      expected: expectedChange,
      isCorrect,
    };
  }

  /**
   * Get solver wallet for a chain (prefers kernel wallet if available)
   */
  getSolverWallet(chain: SupportedChainName): string {
    const wallets = this.solverWallets[chain];
    // Use kernel wallet for EVM chains, basic for Solana
    return (chain !== 'solana' && wallets?.kernel) ? wallets.kernel : wallets?.basic || '';
  }

  /**
   * Take all relevant snapshots before funding
   */
  async snapshotBeforeFunding(
    sourceChain: SupportedChainName,
    destChain: SupportedChainName,
    userSourceAddress: string,
    userDestAddress?: string
  ): Promise<void> {
    const solverSource = this.getSolverWallet(sourceChain);
    const solverDest = this.getSolverWallet(destChain);
    // Use same address for both if destAddress not provided
    const destAddress = userDestAddress || userSourceAddress;

    console.log('\n📊 Balance Snapshots (Before Funding):');

    // User source balance
    const userSourceBefore = await this.snapshot(sourceChain, userSourceAddress, 'user_source_before');
    console.log(`   User ${sourceChain} USDC: ${formatUsdc(userSourceBefore)}`);

    // User destination balance
    const userDestBefore = await this.snapshot(destChain, destAddress, 'user_dest_before');
    console.log(`   User ${destChain} USDC: ${formatUsdc(userDestBefore)}`);

    // Solver source balance
    if (solverSource) {
      const solverSourceBefore = await this.snapshot(sourceChain, solverSource, 'solver_source_before');
      console.log(`   Solver ${sourceChain} USDC: ${formatUsdc(solverSourceBefore)}`);
    }

    // Solver destination balance
    if (solverDest) {
      const solverDestBefore = await this.snapshot(destChain, solverDest, 'solver_dest_before');
      console.log(`   Solver ${destChain} USDC: ${formatUsdc(solverDestBefore)}`);
    }
  }

  /**
   * Verify balances after funding
   */
  async verifyAfterFunding(
    sourceChain: SupportedChainName,
    userAddress: string,
    sourceAmount: bigint
  ): Promise<BalanceChange> {
    console.log('\n📊 Balance Check (After Funding):');

    const change = await this.verifyChange(
      sourceChain,
      userAddress,
      'user_source',
      -sourceAmount
    );

    const symbol = change.isCorrect ? '✓' : '✗';
    console.log(`   User ${sourceChain} USDC: ${formatUsdc(change.before)} → ${formatUsdc(change.after)} (${formatChange(change.change)}) ${symbol}`);

    if (!change.isCorrect) {
      console.log(`   ⚠️ Expected change: ${formatChange(change.expected)}`);
    }

    return change;
  }

  /**
   * Verify balances after fulfillment
   */
  async verifyAfterFulfillment(
    destChain: SupportedChainName,
    userAddress: string,
    destAmount: bigint
  ): Promise<BalanceChange> {
    console.log('\n📊 Balance Check (After Fulfillment):');

    const solverDest = this.getSolverWallet(destChain);

    // User should receive destAmount
    const userChange = await this.verifyChange(
      destChain,
      userAddress,
      'user_dest',
      destAmount
    );

    const userSymbol = userChange.isCorrect ? '✓' : '✗';
    console.log(`   User ${destChain} USDC: ${formatUsdc(userChange.before)} → ${formatUsdc(userChange.after)} (${formatChange(userChange.change)}) ${userSymbol}`);

    // Solver should pay destAmount
    if (solverDest) {
      const solverChange = await this.verifyChange(
        destChain,
        solverDest,
        'solver_dest',
        -destAmount
      );
      const solverSymbol = solverChange.isCorrect ? '✓' : '✗';
      console.log(`   Solver ${destChain} USDC: ${formatUsdc(solverChange.before)} → ${formatUsdc(solverChange.after)} (${formatChange(solverChange.change)}) ${solverSymbol}`);
    }

    return userChange;
  }

  /**
   * Verify balances after withdrawal
   */
  async verifyAfterWithdrawal(
    sourceChain: SupportedChainName,
    sourceAmount: bigint
  ): Promise<BalanceChange | null> {
    console.log('\n📊 Balance Check (After Withdrawal):');

    const solverSource = this.getSolverWallet(sourceChain);

    if (solverSource) {
      const solverChange = await this.verifyChange(
        sourceChain,
        solverSource,
        'solver_source',
        sourceAmount
      );
      const symbol = solverChange.isCorrect ? '✓' : '✗';
      console.log(`   Solver ${sourceChain} USDC: ${formatUsdc(solverChange.before)} → ${formatUsdc(solverChange.after)} (${formatChange(solverChange.change)}) ${symbol}`);
      return solverChange;
    }

    return null;
  }
}
