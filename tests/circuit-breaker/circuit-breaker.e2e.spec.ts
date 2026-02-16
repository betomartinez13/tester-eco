/**
 * Circuit Breaker E2E Route Validation
 *
 *   Phase 0: Discovery   - load routes, fetch chain data (beforeAll)
 *   Phase 1: Publish     - one test per route via it.each (sequential)
 *   Phase 2: Fulfillment - poll getRewardStatus() in parallel (Promise.allSettled)
 *   Phase 3: Proving     - poll provenIntents() in parallel (Promise.allSettled)
 *   Phase 4: Report      - write JSON report, optionally send alert
 */

import { loadConfig } from './lib/config.js';
import { loadRoutes, fetchChainData, fetchQuote, validateRoutes } from './lib/route-fetcher.js';
import { publishIntent } from './lib/intent-publisher.js';
import { waitForFulfillment } from './lib/fulfillment-verifier.js';
import { waitForProven } from './lib/proving-verifier.js';
import { writeReport } from './lib/reporter.js';
import { TestStateManager, makeRouteKey } from './lib/types.js';

const config = loadConfig();
const stateManager = new TestStateManager();

// Store portal addresses fetched during publish so we don't re-query in Phase 2/3
const portalAddressCache = new Map<string, string>(); // routeKey → sourcePortal

// Track routes that failed Phase 0 validation so Phase 1 can skip them
const skippedRouteKeys = new Set<string>();

// Load routes synchronously at module level — required for it.each registration
const allRoutes = loadRoutes(config);
for (const r of allRoutes) {
  stateManager.initRoute(r);
}

describe('Circuit Breaker E2E', () => {

  // ── Phase 0: Discovery (beforeAll) ────────────────────────────────────────

  beforeAll(async () => {
    console.log(`\n📋 Loaded ${allRoutes.length} routes from ${config.routes.file}`);
    for (const r of allRoutes) {
      console.log(`   ${r.sourceChainId} → ${r.destinationChainId}`);
    }

    const chainData = await fetchChainData(config, allRoutes);
    console.log(`\n🔗 Chain data loaded for ${chainData.size} chains`);

    const { valid, skipped } = validateRoutes(allRoutes, chainData);
    for (const { route, reason } of skipped) {
      stateManager.skipRoute(route);
      skippedRouteKeys.add(makeRouteKey(route));
      console.warn(`   ⏭️  Skipping ${makeRouteKey(route)}: ${reason}`);
    }
    console.log(`   ${valid.length}/${allRoutes.length} routes passed validation`);
  }, 60_000);

  // ── Phase 1: Publish (one test per route) ─────────────────────────────────

  describe('Phase 1: Intent Publishing', () => {
    it.each(allRoutes)(
      'publishes $sourceChainId→$destinationChainId',
      async (route) => {
        if (skippedRouteKeys.has(makeRouteKey(route))) return;

        const routeKey = makeRouteKey(route);
        console.log(`\n🚀 Publishing ${route.sourceChainId} → ${route.destinationChainId}...`);
        try {
          const publishStartedAt = Date.now();
          const result = await publishIntent(config, route);
          stateManager.recordPublish(route, {
            intentHash: result.intentHash,
            publishTxHash: result.publishTxHash,
            proverAddress: result.proverAddress,
            publishStartedAt,
          });
          portalAddressCache.set(routeKey, result.sourcePortal);
          console.log(`   ✅ Published ${routeKey} → intent ${result.intentHash.slice(0, 12)}...`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          stateManager.recordPublish(route, { error: message });
          console.error(`   ❌ Failed to publish ${routeKey}: ${message}`);
        }
      },
    );
  });

  // ── Phase 2: Fulfillment (all routes in parallel) ─────────────────────────

  describe('Phase 2: Fulfillment Verification', () => {
    it('waits for all published intents to be fulfilled', async () => {
      const published = stateManager.getPublishedIntents();

      if (published.length === 0) {
        console.log('\n⚠️  No published intents to verify');
        return;
      }

      console.log(`\n⏳ Waiting for ${published.length} fulfillments...`);

      await Promise.allSettled(
        published.map(async (state) => {
          const routeKey = state.routeKey;
          try {
            let sourcePortal = portalAddressCache.get(routeKey);
            if (!sourcePortal) {
              const { contracts } = await fetchQuote(config, state.route);
              sourcePortal = contracts.sourcePortal;
              portalAddressCache.set(routeKey, sourcePortal);
            }

            const result = await waitForFulfillment(
              config,
              state.route.sourceChainId,
              sourcePortal,
              state.intentHash!,
            );
            stateManager.recordFulfillment(state.route, {
              fulfilledAt: result.detectedAt,
            });
            const elapsed = Math.round((result.detectedAt - (state.publishedAt ?? Date.now())) / 1000);
            console.log(`   ✅ Fulfilled ${routeKey} (status=${result.status}) in ${elapsed}s`);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            stateManager.recordFulfillmentFailure(state.route, message);
            console.error(`   ❌ Fulfillment failed for ${routeKey}: ${message}`);
          }
        }),
      );

      const fulfilled = stateManager.getFulfilledIntents();
      console.log(`\n   ${fulfilled.length}/${published.length} intents fulfilled`);
    });
  });

  // ── Phase 3: Proving (all routes in parallel) ─────────────────────────────

  describe('Phase 3: Proving Verification', () => {
    it('waits for all fulfilled intents to be proven (withdrawn)', async () => {
      const fulfilled = stateManager.getFulfilledIntents();

      if (fulfilled.length === 0) {
        console.log('\n⚠️  No fulfilled intents to prove');
        return;
      }

      console.log(`\n⏳ Waiting for ${fulfilled.length} proofs...`);

      await Promise.allSettled(
        fulfilled.map(async (state) => {
          const routeKey = state.routeKey;
          try {
            const result = await waitForProven(
              config,
              state.route.sourceChainId,
              state.publishedProverAddress ?? state.route.proverAddress,
              state.intentHash!,
            );
            stateManager.recordProving(state.route, {
              provenAt: result.detectedAt,
            });
            const totalMs = state.totalDurationMs ?? 0;
            console.log(`   ✅ Proven ${routeKey} in ${Math.round(totalMs / 1000)}s total`);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            stateManager.recordProvingFailure(state.route, message);
            console.error(`   ❌ Proving failed for ${routeKey}: ${message}`);
          }
        }),
      );

      const proven = stateManager.getProvenIntents();
      console.log(`\n   ${proven.length}/${fulfilled.length} intents proven`);
    });
  });

  // ── Phase 4: Report ───────────────────────────────────────────────────────

  describe('Phase 4: Report', () => {
    it('writes report and asserts no failures', async () => {
      await writeReport(config, stateManager);

      const summary = stateManager.getSummary();
      const failedRoutes = stateManager
        .getAllResults()
        .filter((r) =>
          ['publish_failed', 'fulfillment_failed', 'proving_failed'].includes(r.status),
        );

      if (failedRoutes.length > 0) {
        console.error('\n❌ Failed routes:');
        for (const r of failedRoutes) {
          console.error(`   ${r.routeKey}: [${r.errorPhase}] ${r.error}`);
        }
      }

      expect(summary.failed).toBe(0);
    });
  });
});
