import type { Hex, Address } from 'viem';
import type { CircuitBreakerConfig } from './config.js';
import { getPublicClient, SOLANA_CHAIN_ID } from './clients.js';

// getRewardStatus ABI fragment
const GET_REWARD_STATUS_ABI = [
  {
    inputs: [{ name: 'intentHash', type: 'bytes32' }],
    name: 'getRewardStatus',
    outputs: [{ name: 'status', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// IIntentSource.Status enum values
export const RewardStatus = {
  Pending: 0,
  Funded: 1,
  Fulfilled: 2,
  Withdrawn: 3,
} as const;

export type RewardStatusValue = (typeof RewardStatus)[keyof typeof RewardStatus];

/**
 * Poll the source chain Portal contract until the intent status reaches
 * at least Fulfilled (2) or Withdrawn (3), or the timeout is exceeded.
 *
 * Returns the timestamp (ms) when fulfilled, or throws on timeout.
 */
export async function waitForFulfillment(
  config: CircuitBreakerConfig,
  sourceChainId: number,
  sourcePortal: string,
  intentHash: Hex,
): Promise<{ status: RewardStatusValue; detectedAt: number }> {
  if (sourceChainId === SOLANA_CHAIN_ID) {
    throw new Error('SVM fulfillment verification not yet supported');
  }

  const publicClient = getPublicClient(sourceChainId, config);
  const portalAddress = sourcePortal as Address;

  const { fulfillmentWaitMs, fulfillmentVerifyMs } = config.timeouts;
  const { initialIntervalMs, multiplier, maxIntervalMs } = config.polling;

  const deadline = Date.now() + fulfillmentWaitMs;
  let interval = initialIntervalMs;
  let lastStatus: number = RewardStatus.Pending;

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

      if (lastStatus >= RewardStatus.Fulfilled) {
        return { status: lastStatus as RewardStatusValue, detectedAt: Date.now() };
      }
    } catch (err) {
      // transient RPC error - continue polling
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[fulfillment-verifier] RPC error on chain ${sourceChainId}: ${message}`);
    }

    // Backoff
    interval = Math.min(interval * multiplier, maxIntervalMs);
  }

  // One final verify window before giving up
  const verifyDeadline = Date.now() + fulfillmentVerifyMs;
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
      if (s >= RewardStatus.Fulfilled) {
        return { status: s as RewardStatusValue, detectedAt: Date.now() };
      }
    } catch {
      // ignore
    }
  }

  throw new Error(
    `Fulfillment timeout after ${fulfillmentWaitMs + fulfillmentVerifyMs}ms. Last status: ${lastStatus}`,
  );
}
