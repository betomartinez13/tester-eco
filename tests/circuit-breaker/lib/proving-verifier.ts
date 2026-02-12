import type { Hex, Address } from 'viem';
import type { CircuitBreakerConfig } from './config.js';
import { getPublicClient, SOLANA_CHAIN_ID } from './clients.js';
import { type RewardStatusValue, RewardStatus } from './fulfillment-verifier.js';
import { waitForSvmProven } from './svm-verifier.js';

// provenIntents(bytes32) returns (ProofData { address claimant; uint64 destination })
const PROVEN_INTENTS_ABI = [
  {
    inputs: [{ name: 'intentHash', type: 'bytes32' }],
    name: 'provenIntents',
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'claimant', type: 'address' },
          { name: 'destination', type: 'uint64' },
        ],
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Poll the prover contract until provenIntents(intentHash).claimant is set
 * (non-zero address), meaning the cross-chain proof has been delivered.
 *
 * Returns the timestamp (ms) when proven, or throws on timeout.
 */
export async function waitForProven(
  config: CircuitBreakerConfig,
  sourceChainId: number,
  proverAddress: string,
  intentHash: Hex,
): Promise<{ status: RewardStatusValue; detectedAt: number }> {
  if (sourceChainId === SOLANA_CHAIN_ID) {
    return waitForSvmProven(config, proverAddress, intentHash);
  }

  const publicClient = getPublicClient(sourceChainId, config);
  const prover = proverAddress as Address;

  const { provingWaitMs, provingVerifyMs } = config.timeouts;
  const { initialIntervalMs, multiplier, maxIntervalMs } = config.polling;

  const deadline = Date.now() + provingWaitMs;
  let interval = initialIntervalMs;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, interval));

    try {
      const proofData = await publicClient.readContract({
        address: prover,
        abi: PROVEN_INTENTS_ABI,
        functionName: 'provenIntents',
        args: [intentHash],
      });

      if (proofData.claimant !== ZERO_ADDRESS) {
        return { status: RewardStatus.Withdrawn, detectedAt: Date.now() };
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
      const proofData = await publicClient.readContract({
        address: prover,
        abi: PROVEN_INTENTS_ABI,
        functionName: 'provenIntents',
        args: [intentHash],
      });
      if (proofData.claimant !== ZERO_ADDRESS) {
        return { status: RewardStatus.Withdrawn, detectedAt: Date.now() };
      }
    } catch {
      // ignore
    }
  }

  throw new Error(
    `Proving timeout after ${provingWaitMs + provingVerifyMs}ms. provenIntents claimant not set.`,
  );
}
