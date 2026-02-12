import type { Hex } from 'viem';
import type { RouteDefinition } from '../schemas/route.schema.js';
import type { RouteResult, CircuitBreakerReport } from '../schemas/report.schema.js';

export type { RouteDefinition };

export interface RouteTestState {
  route: RouteDefinition;
  routeKey: string;

  // Phase 1
  quoteResponse?: unknown;
  intentHash?: Hex;
  publishTxHash?: Hex;
  publishedAt?: number;
  publishError?: string;
  publishedProverAddress?: string;

  // Phase 2
  fulfilled?: boolean;
  fulfilledAt?: number;
  fulfillmentTxHash?: Hex;
  fulfillmentError?: string;

  // Phase 3
  proven?: boolean;
  provenAt?: number;
  provingTxHash?: Hex;
  provingError?: string;

  status:
    | 'pending'
    | 'published'
    | 'fulfilled'
    | 'proven'
    | 'publish_failed'
    | 'fulfillment_failed'
    | 'proving_failed'
    | 'skipped';

  totalDurationMs?: number;
}

export type ChainTokenInfo = {
  symbol: string;
  decimals: number;
};

export type ChainData = {
  chainType: 'EVM' | 'SVM' | 'TVM';
  portalAddress: string;
  tokens: Map<string, ChainTokenInfo>;
};

export type ChainDataMap = Map<number, ChainData>;

export function makeRouteKey(route: RouteDefinition): string {
  return `${route.sourceChainId}:${route.destinationChainId}:${route.sourceToken.slice(0, 6)}:${route.destinationToken.slice(0, 6)}`;
}

export class TestStateManager {
  private states = new Map<string, RouteTestState>();
  readonly startedAt: number = Date.now();

  initRoute(route: RouteDefinition): void {
    const routeKey = makeRouteKey(route);
    this.states.set(routeKey, { route, routeKey, status: 'pending' });
  }

  recordPublish(
    route: RouteDefinition,
    result: { intentHash: Hex; publishTxHash: Hex; proverAddress?: string } | { error: string },
  ): void {
    const routeKey = makeRouteKey(route);
    const state = this.states.get(routeKey)!;
    if ('error' in result) {
      state.status = 'publish_failed';
      state.publishError = result.error;
    } else {
      state.status = 'published';
      state.intentHash = result.intentHash;
      state.publishTxHash = result.publishTxHash;
      state.publishedAt = Date.now();
      state.publishedProverAddress = result.proverAddress;
    }
  }

  recordFulfillment(
    route: RouteDefinition,
    result: { fulfillmentTxHash?: Hex; fulfilledAt: number },
  ): void {
    const routeKey = makeRouteKey(route);
    const state = this.states.get(routeKey)!;
    state.status = 'fulfilled';
    state.fulfilled = true;
    state.fulfilledAt = result.fulfilledAt;
    state.fulfillmentTxHash = result.fulfillmentTxHash;
  }

  recordFulfillmentFailure(route: RouteDefinition, error: string): void {
    const routeKey = makeRouteKey(route);
    const state = this.states.get(routeKey)!;
    state.status = 'fulfillment_failed';
    state.fulfillmentError = error;
  }

  recordProving(
    route: RouteDefinition,
    result: { provingTxHash?: Hex; provenAt: number },
  ): void {
    const routeKey = makeRouteKey(route);
    const state = this.states.get(routeKey)!;
    state.status = 'proven';
    state.proven = true;
    state.provenAt = result.provenAt;
    state.provingTxHash = result.provingTxHash;
    state.totalDurationMs = result.provenAt - (state.publishedAt ?? Date.now());
  }

  recordProvingFailure(route: RouteDefinition, error: string): void {
    const routeKey = makeRouteKey(route);
    const state = this.states.get(routeKey)!;
    state.status = 'proving_failed';
    state.provingError = error;
  }

  getPublishedIntents(): RouteTestState[] {
    return Array.from(this.states.values()).filter(
      (s) => s.status === 'published',
    );
  }

  getFulfilledIntents(): RouteTestState[] {
    return Array.from(this.states.values()).filter(
      (s) => s.status === 'fulfilled',
    );
  }

  getSummary(): CircuitBreakerReport['summary'] {
    const all = Array.from(this.states.values());
    return {
      totalRoutes: all.length,
      passed: all.filter((s) => s.status === 'proven').length,
      failed: all.filter((s) =>
        ['publish_failed', 'fulfillment_failed', 'proving_failed'].includes(s.status),
      ).length,
      skipped: all.filter((s) => s.status === 'skipped').length,
    };
  }

  skipRoute(route: RouteDefinition): void {
    const routeKey = makeRouteKey(route);
    const state = this.states.get(routeKey)!;
    state.status = 'skipped';
  }

  getProvenIntents(): RouteTestState[] {
    return Array.from(this.states.values()).filter((s) => s.status === 'proven');
  }

  getAllResults(): RouteResult[] {
    return Array.from(this.states.values()).map((s) => ({
      routeKey: s.routeKey,
      sourceChainId: s.route.sourceChainId,
      destinationChainId: s.route.destinationChainId,
      sourceToken: s.route.sourceToken,
      destinationToken: s.route.destinationToken,
      status: s.status === 'proven'
        ? 'passed'
        : s.status === 'fulfilled' || s.status === 'published'
          ? 'proving_failed'
          : (s.status as RouteResult['status']),
      publishTxHash: s.publishTxHash,
      fulfillmentTxHash: s.fulfillmentTxHash,
      provingTxHash: s.provingTxHash,
      intentHash: s.intentHash,
      totalDurationMs: s.totalDurationMs,
      error:
        s.publishError ?? s.fulfillmentError ?? s.provingError,
      errorPhase: s.publishError
        ? 'publish'
        : s.fulfillmentError
          ? 'fulfillment'
          : s.provingError
            ? 'proving'
            : undefined,
    }));
  }
}
