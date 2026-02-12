/**
 * Circuit Breaker E2E Route Validation
 *
 * Validates all cross-chain routes end-to-end:
 *   Phase 0: Discovery   - load routes, fetch chain data
 *   Phase 1: Publish     - send intents for all EVM-sourced routes (bounded concurrency)
 *   Phase 2: Fulfillment - poll getRewardStatus() until Fulfilled or Withdrawn
 *   Phase 3: Proving     - poll getRewardStatus() until Withdrawn
 *   Phase 4: Report      - write JSON report, optionally send alert
 */

import pMap from 'p-map';
import { loadConfig } from './lib/config.js';
import { loadRoutes, fetchChainData, fetchQuote } from './lib/route-fetcher.js';
import { publishIntent } from './lib/intent-publisher.js';
import { waitForFulfillment } from './lib/fulfillment-verifier.js';
import { waitForProven } from './lib/proving-verifier.js';
import { writeReport } from './lib/reporter.js';
import { TestStateManager, makeRouteKey } from './lib/types.js';
import type { RouteDefinition } from './schemas/route.schema.js';

const config = loadConfig();
const stateManager = new TestStateManager();

// Store portal addresses fetched during publish so we don't re-query in Phase 2/3
const portalAddressCache = new Map<string, string>(); // routeKey → sourcePortal

describe('Circuit Breaker E2E', () => {
  let routes: RouteDefinition[];

  // ── Phase 0: Discovery ────────────────────────────────────────────────────

  describe('Phase 0: Route Discovery', () => {
    it('loads routes from file', () => {
      routes = loadRoutes(config);
      expect(routes.length).toBeGreaterThan(0);
      console.log(`\n📋 Loaded ${routes.length} routes from ${config.routes.file}`);
      for (const r of routes) {
        console.log(`   ${r.sourceChainId} → ${r.destinationChainId}`);
        stateManager.initRoute(r);
      }
    });

    it('fetches chain data from solver', async () => {
      const chainData = await fetchChainData(config, routes);
      expect(chainData.size).toBeGreaterThan(0);
      console.log(`\n🔗 Chain data loaded for ${chainData.size} chains`);
    });
  });

  // ── Phase 1: Publish ──────────────────────────────────────────────────────

  describe('Phase 1: Intent Publishing', () => {
    it('publishes intents for all routes', async () => {
      console.log(
        `\n🚀 Publishing ${routes.length} intents (concurrency: ${config.test.publishConcurrency})`,
      );

      await pMap(
        routes,
        async (route) => {
          const routeKey = makeRouteKey(route);
          console.log(`   Publishing ${route.sourceChainId} → ${route.destinationChainId}...`);
          try {
            const result = await publishIntent(config, route);
            stateManager.recordPublish(route, {
              intentHash: result.intentHash,
              publishTxHash: result.publishTxHash,
              proverAddress: result.proverAddress,
            });
            portalAddressCache.set(routeKey, result.sourcePortal);
            console.log(
              `   ✅ Published ${routeKey} → intent ${result.intentHash.slice(0, 12)}...`,
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            stateManager.recordPublish(route, { error: message });
            console.error(`   ❌ Failed to publish ${routeKey}: ${message}`);
          }
        },
        { concurrency: config.test.publishConcurrency },
      );

      const published = stateManager.getPublishedIntents();
      console.log(`\n   ${published.length}/${routes.length} intents published`);
    });
  });

  // ── Phase 2: Fulfillment ──────────────────────────────────────────────────

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
            // Get portal address from cache (set during publish) or fetch fresh
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

  // ── Phase 3: Proving ──────────────────────────────────────────────────────

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
