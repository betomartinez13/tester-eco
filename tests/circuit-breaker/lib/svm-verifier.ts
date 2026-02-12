/**
 * SVM Fulfillment & Proving Verifier
 *
 * Uses the Eco solver API to check intent status — works for any chain type
 * without needing to know chain-specific PDA seeds or contract ABIs.
 *
 * POST https://quotes.eco.com/api/v3/intents/intentStatus
 */

import type { CircuitBreakerConfig } from './config.js';
import { RewardStatus, type RewardStatusValue } from './fulfillment-verifier.js';

const INTENT_STATUS_URL = 'https://quotes.eco.com/api/v3/intents/intentStatus';

interface IntentStatusResponse {
  data: {
    intentHash: string;
    status: {
      status: string;
      subStatus: string;
      subStatusMessage: string;
    };
    intentCreated?: { chainId: number; transactionHash: string } | null;
    fulfillment?: { chainId: number; transactionHash: string } | null;
    refund?: { chainId: number; transactionHash: string } | null;
  };
}

/**
 * Fetch the current status of an intent from the solver API.
 * Returns a RewardStatusValue compatible with the EVM verifier.
 */
async function fetchIntentStatus(intentHash: string): Promise<RewardStatusValue> {
  const res = await fetch(INTENT_STATUS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intentHash }),
  });

  if (!res.ok) {
    throw new Error(`Intent status API returned ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as IntentStatusResponse;
  const { status, fulfillment } = json.data;

  // Withdrawn/proven: solver completed the full lifecycle
  const statusLower = status.status.toLowerCase();
  const subStatusLower = status.subStatus.toLowerCase();
  if (
    statusLower.includes('withdraw') ||
    statusLower.includes('proven') ||
    statusLower.includes('complete') ||
    subStatusLower.includes('withdraw') ||
    subStatusLower.includes('proven') ||
    subStatusLower.includes('complete')
  ) {
    return RewardStatus.Withdrawn;
  }

  // Fulfilled: cross-chain transfer happened
  if (fulfillment !== null && fulfillment !== undefined) {
    return RewardStatus.Fulfilled;
  }

  return RewardStatus.Funded;
}

/**
 * Wait for a Solana-sourced intent to reach Fulfilled (or Withdrawn) status.
 */
export async function waitForSvmFulfillment(
  config: CircuitBreakerConfig,
  _portalAddress: string,
  intentHash: string,
): Promise<{ status: RewardStatusValue; detectedAt: number }> {
  const { fulfillmentWaitMs, fulfillmentVerifyMs } = config.timeouts;
  const { initialIntervalMs, multiplier, maxIntervalMs } = config.polling;

  const deadline = Date.now() + fulfillmentWaitMs;
  let interval = initialIntervalMs;
  let lastStatus: RewardStatusValue = RewardStatus.Funded;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, interval));

    try {
      const status = await fetchIntentStatus(intentHash);
      lastStatus = status;

      if (status >= RewardStatus.Fulfilled) {
        return { status, detectedAt: Date.now() };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[svm-verifier] API error: ${message}`);
    }

    interval = Math.min(interval * multiplier, maxIntervalMs);
  }

  // Verify window
  const verifyDeadline = Date.now() + fulfillmentVerifyMs;
  while (Date.now() < verifyDeadline) {
    await new Promise((resolve) => setTimeout(resolve, initialIntervalMs));
    try {
      const status = await fetchIntentStatus(intentHash);
      if (status >= RewardStatus.Fulfilled) {
        return { status, detectedAt: Date.now() };
      }
    } catch {
      // ignore
    }
  }

  throw new Error(
    `SVM fulfillment timeout after ${fulfillmentWaitMs + fulfillmentVerifyMs}ms. Last status: ${lastStatus}`,
  );
}

/**
 * Wait for a Solana-sourced intent to reach Withdrawn status (fully proven).
 */
export async function waitForSvmProven(
  config: CircuitBreakerConfig,
  _portalAddress: string,
  intentHash: string,
): Promise<{ status: RewardStatusValue; detectedAt: number }> {
  const { provingWaitMs, provingVerifyMs } = config.timeouts;
  const { initialIntervalMs, multiplier, maxIntervalMs } = config.polling;

  const deadline = Date.now() + provingWaitMs;
  let interval = initialIntervalMs;
  let lastStatus: RewardStatusValue = RewardStatus.Fulfilled;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, interval));

    try {
      const status = await fetchIntentStatus(intentHash);
      lastStatus = status;

      if (status >= RewardStatus.Withdrawn) {
        return { status, detectedAt: Date.now() };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[svm-verifier] API error: ${message}`);
    }

    interval = Math.min(interval * multiplier, maxIntervalMs);
  }

  // Verify window
  const verifyDeadline = Date.now() + provingVerifyMs;
  while (Date.now() < verifyDeadline) {
    await new Promise((resolve) => setTimeout(resolve, initialIntervalMs));
    try {
      const status = await fetchIntentStatus(intentHash);
      if (status >= RewardStatus.Withdrawn) {
        return { status, detectedAt: Date.now() };
      }
    } catch {
      // ignore
    }
  }

  throw new Error(
    `SVM proving timeout after ${provingWaitMs + provingVerifyMs}ms. Last status: ${lastStatus}`,
  );
}
