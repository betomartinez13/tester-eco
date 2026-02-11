import fs from 'node:fs';
import type { CircuitBreakerConfig } from './config.js';
import { RoutesFileSchema, type RouteDefinition } from '../schemas/route.schema.js';
import type { ChainDataMap, ChainData } from './types.js';

interface SolverChainToken {
  address: string;
  decimals: number;
  symbol: string;
}

interface SolverChain {
  chainId: number;
  chainType: 'EVM' | 'SVM' | 'TVM';
  tokens: SolverChainToken[];
}

interface SolverQuoteContracts {
  sourcePortal: string;
  destinationPortal: string;
  prover: string;
}

interface SolverQuoteSuccess {
  quoteResponses: unknown[];
  contracts: SolverQuoteContracts;
}

/**
 * Load routes from the static JSON file specified in config
 */
export function loadRoutes(config: CircuitBreakerConfig): RouteDefinition[] {
  const raw = fs.readFileSync(config.routes.file, 'utf-8');
  const parsed = JSON.parse(raw);
  return RoutesFileSchema.parse(parsed);
}

/**
 * Fetch chain metadata (portal addresses, token decimals) from solver API.
 * Also fetches portal addresses via a test quote for each unique chain pair.
 */
export async function fetchChainData(
  config: CircuitBreakerConfig,
  routes: RouteDefinition[],
): Promise<ChainDataMap> {
  const map: ChainDataMap = new Map();

  // 1. Get chain metadata from solver
  const chainsRes = await fetch(`${config.solver.url}/api/v1/blockchain/chains`, {
    headers: { Accept: 'application/json' },
  });
  if (!chainsRes.ok) {
    throw new Error(`Failed to fetch chains from solver: ${chainsRes.status}`);
  }
  const solverChains = (await chainsRes.json()) as SolverChain[];

  for (const sc of solverChains) {
    const tokens = new Map<string, { symbol: string; decimals: number }>();
    for (const t of sc.tokens) {
      tokens.set(t.address.toLowerCase(), { symbol: t.symbol, decimals: t.decimals });
    }
    map.set(sc.chainId, {
      chainType: sc.chainType,
      portalAddress: '', // filled below
      tokens,
    });
  }

  // 2. Fetch portal addresses via quote for each unique source chain
  const walletAddress = config.wallet.recipientAddress;
  const seenSourceChains = new Set<number>();

  for (const route of routes) {
    const srcId = route.sourceChainId;
    if (seenSourceChains.has(srcId)) continue;
    seenSourceChains.add(srcId);

    try {
      const quoteRes = await fetch(`${config.solver.url}/api/v2/quote/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dAppID: 'circuit-breaker',
          quoteID: `cb-discovery-${srcId}-${Date.now()}`,
          intentExecutionTypes: ['SELF_PUBLISH'],
          quoteRequest: {
            sourceChainID: route.sourceChainId,
            destinationChainID: route.destinationChainId,
            sourceToken: route.sourceToken,
            destinationToken: route.destinationToken,
            sourceAmount: String(Math.round(parseFloat(config.test.amount) * 1e6)),
            funder: walletAddress,
            recipient: walletAddress,
          },
        }),
      });

      if (!quoteRes.ok) continue;
      const quoteData = (await quoteRes.json()) as SolverQuoteSuccess;
      if (!quoteData.contracts) continue;

      // Update source chain portal address
      const srcData = map.get(srcId);
      if (srcData && !srcData.portalAddress) {
        map.set(srcId, { ...srcData, portalAddress: quoteData.contracts.sourcePortal });
      }

      // Update destination chain portal address
      const dstId = route.destinationChainId;
      const dstData = map.get(dstId);
      if (dstData && !dstData.portalAddress) {
        map.set(dstId, { ...dstData, portalAddress: quoteData.contracts.destinationPortal });
      }
    } catch {
      // Non-fatal: portal address may still be discovered from another route
    }
  }

  return map;
}

/**
 * Fetch a live quote for a specific route from the solver
 */
export async function fetchQuote(
  config: CircuitBreakerConfig,
  route: RouteDefinition,
): Promise<{
  quoteItem: {
    sourceAmount: string;
    destinationAmount: string;
    deadline: number;
    encodedRoute: string;
  };
  contracts: SolverQuoteContracts;
}> {
  const walletAddress = config.wallet.recipientAddress;
  const sourceAmountStr = String(Math.round(parseFloat(config.test.amount) * 1e6));

  const res = await fetch(`${config.solver.url}/api/v2/quote/reverse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dAppID: 'circuit-breaker',
      quoteID: `cb-${route.sourceChainId}-${route.destinationChainId}-${Date.now()}`,
      intentExecutionTypes: ['SELF_PUBLISH'],
      quoteRequest: {
        sourceChainID: route.sourceChainId,
        destinationChainID: route.destinationChainId,
        sourceToken: route.sourceToken,
        destinationToken: route.destinationToken,
        sourceAmount: sourceAmountStr,
        funder: walletAddress,
        recipient: walletAddress,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Quote failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as SolverQuoteSuccess & { validations?: { failed: unknown[] } };
  if (!data.contracts || !data.quoteResponses || data.quoteResponses.length === 0) {
    throw new Error(`Quote rejected: ${JSON.stringify((data as { validations?: { failed: unknown[] } }).validations?.failed ?? data)}`);
  }

  const quoteItem = data.quoteResponses[0] as {
    sourceAmount: string;
    destinationAmount: string;
    deadline: number;
    encodedRoute: string;
  };
  return { quoteItem, contracts: data.contracts };
}
