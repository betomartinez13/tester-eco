import type { Hex, Address } from 'viem';
import type { CircuitBreakerConfig } from './config.js';
import { getPublicClient, SOLANA_CHAIN_ID } from './clients.js';
import { RewardStatus, type RewardStatusValue } from './fulfillment-verifier.js';

// getRewardStatus ABI fragment (same as fulfillment-verifier)
const GET_REWARD_STATUS_ABI = [
  {
    inputs: [{ name: 'intentHash', type: 'bytes32' }],
    name: 'getRewardStatus',
    outputs: [{ name: 'status', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Poll the source chain Portal contract until the intent status reaches
 * Withdrawn (3), meaning the full cross-chain lifecycle is complete.
 *
 * Returns the timestamp (ms) when withdrawn, or throws on timeout.
 */
export async function waitForProven(
  config: CircuitBreakerConfig,
  sourceChainId: number,
  sourcePortal: string,
  intentHash: Hex,
): Promise<{ status: RewardStatusValue; detectedAt: number }> {
  if (sourceChainId === SOLANA_CHAIN_ID) {
    throw new Error('SVM proving verification not yet supported');
  }

  const publicClient = getPublicClient(sourceChainId, config);
  const portalAddress = sourcePortal as Address;

  const { provingWaitMs, provingVerifyMs } = config.timeouts;
  const { initialIntervalMs, multiplier, maxIntervalMs } = config.polling;

  const deadline = Date.now() + provingWaitMs;
  let interval = initialIntervalMs;
  let lastStatus: number = RewardStatus.Fulfilled;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, interval));

    try {
      const status = await publicClient.readContract({
        address: portalAddress,
        abi: GET_REWARD_STATUS_ABI,
        functionName: 'getRewardStatus',
        args: [intentHash],
      });

      lastStatus = Number(status);

      if (lastStatus >= RewardStatus.Withdrawn) {
        return { status: lastStatus as RewardStatusValue, detectedAt: Date.now() };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[proving-verifier] RPC error on chain ${sourceChainId}: ${message}`);
    }

    interval = Math.min(interval * multiplier, maxIntervalMs);
  }

  // Verify window
  const verifyDeadline = Date.now() + provingVerifyMs;
  while (Date.now() < verifyDeadline) {
    await new Promise((resolve) => setTimeout(resolve, initialIntervalMs));
    try {
      const status = await publicClient.readContract({
        address: portalAddress,
        abi: GET_REWARD_STATUS_ABI,
        functionName: 'getRewardStatus',
        args: [intentHash],
      });
      const s = Number(status);
      if (s >= RewardStatus.Withdrawn) {
        return { status: s as RewardStatusValue, detectedAt: Date.now() };
      }
    } catch {
      // ignore
    }
  }

  throw new Error(
    `Proving timeout after ${provingWaitMs + provingVerifyMs}ms. Last status: ${lastStatus}`,
  );
}
