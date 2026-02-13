import fs from 'node:fs';
import type { CircuitBreakerConfig } from './config.js';
import { RoutesFileSchema, type RouteDefinition } from '../schemas/route.schema.js';
import type { ChainDataMap } from './types.js';
import { getSolanaKeypair, SOLANA_CHAIN_ID } from './clients.js';

const QUOTES_V3_URL = 'https://quotes.eco.com/api/v3/quotes/exactIn';

/** Returns EVM address for EVM chains, Solana Base58 pubkey for Solana */
function getAddressForChain(chainId: number, config: CircuitBreakerConfig): string {
  if (chainId === SOLANA_CHAIN_ID) {
    const keypair = getSolanaKeypair(config);
    return keypair.publicKey.toBase58();
  }
  return config.wallet.recipientAddress;
}

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

interface V3QuoteContracts {
  sourcePortal: string;
  destinationPortal: string;
  prover: string;
}

interface V3QuoteResponse {
  sourceAmount: string;
  destinationAmount: string;
  deadline: number;
  encodedRoute: string;
  fees: { amount: string }[];
}

interface V3QuoteData {
  contracts: V3QuoteContracts;
  quoteResponse: V3QuoteResponse;
}

interface V3QuoteResult {
  quoteID: string;
  quoteData: V3QuoteData;
}

interface V3Response {
  data?: V3QuoteResult[];
  statusCode?: number;
  errorMessage?: string;
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
 * Validate routes against chain data fetched from the solver.
 * Routes with unknown chains or unsupported tokens are marked as skipped.
 */
export function validateRoutes(
  routes: RouteDefinition[],
  chainData: ChainDataMap,
): { valid: RouteDefinition[]; skipped: { route: RouteDefinition; reason: string }[] } {
  const valid: RouteDefinition[] = [];
  const skipped: { route: RouteDefinition; reason: string }[] = [];

  for (const route of routes) {
    const srcChain = chainData.get(route.sourceChainId);
    if (!srcChain) {
      skipped.push({ route, reason: `Chain ${route.sourceChainId} not configured in solver` });
      continue;
    }

    const dstChain = chainData.get(route.destinationChainId);
    if (!dstChain) {
      skipped.push({ route, reason: `Chain ${route.destinationChainId} not configured in solver` });
      continue;
    }

    if (!srcChain.tokens.has(route.sourceToken.toLowerCase())) {
      skipped.push({ route, reason: `Token ${route.sourceToken} not supported on chain ${route.sourceChainId}` });
      continue;
    }

    if (!dstChain.tokens.has(route.destinationToken.toLowerCase())) {
      skipped.push({ route, reason: `Token ${route.destinationToken} not supported on chain ${route.destinationChainId}` });
      continue;
    }

    valid.push(route);
  }

  return { valid, skipped };
}

async function callQuotesV3(
  sourceChainId: number,
  destinationChainId: number,
  sourceToken: string,
  destinationToken: string,
  sourceAmount: string,
  funder: string,
  recipient: string,
): Promise<V3Response> {
  const res = await fetch(QUOTES_V3_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dAppID: 'circuit-breaker',
      intentExecutionTypes: ['SELF_PUBLISH'],
      quoteRequest: {
        sourceChainID: sourceChainId,
        destinationChainID: destinationChainId,
        sourceToken,
        destinationToken,
        sourceAmount,
        funder,
        recipient,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Quote request failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<V3Response>;
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
  const seenSourceChains = new Set<number>();
  const sourceAmountStr = String(Math.round(parseFloat(config.test.amount) * 1e6));

  for (const route of routes) {
    const srcId = route.sourceChainId;
    if (seenSourceChains.has(srcId)) continue;
    seenSourceChains.add(srcId);

    try {
      const funder = getAddressForChain(route.sourceChainId, config);
      const recipient = getAddressForChain(route.destinationChainId, config);

      const data = await callQuotesV3(
        route.sourceChainId,
        route.destinationChainId,
        route.sourceToken,
        route.destinationToken,
        sourceAmountStr,
        funder,
        recipient,
      );

      const first = data.data?.[0];
      if (!first?.quoteData?.contracts) continue;

      const { contracts } = first.quoteData;

      // Update source chain portal address
      const srcData = map.get(srcId);
      if (srcData && !srcData.portalAddress) {
        map.set(srcId, { ...srcData, portalAddress: contracts.sourcePortal });
      }

      // Update destination chain portal address
      const dstId = route.destinationChainId;
      const dstData = map.get(dstId);
      if (dstData && !dstData.portalAddress) {
        map.set(dstId, { ...dstData, portalAddress: contracts.destinationPortal });
      }
    } catch {
      // Non-fatal: portal address may still be discovered from another route
    }
  }

  return map;
}

/**
 * Fetch a live quote for a specific route from the solver using v3 exactIn endpoint.
 * The sourceAmount comes directly from the quote response.
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
  contracts: V3QuoteContracts;
}> {
  const funder = getAddressForChain(route.sourceChainId, config);
  const recipient = getAddressForChain(route.destinationChainId, config);
  const sourceAmountStr = String(Math.round(parseFloat(config.test.amount) * 1e6));

  const data = await callQuotesV3(
    route.sourceChainId,
    route.destinationChainId,
    route.sourceToken,
    route.destinationToken,
    sourceAmountStr,
    funder,
    recipient,
  );

  const first = data.data?.[0];
  if (!first?.quoteData?.contracts || !first?.quoteData?.quoteResponse) {
    throw new Error(`Quote returned no results: ${JSON.stringify(data)}`);
  }

  const { contracts, quoteResponse } = first.quoteData;

  return {
    quoteItem: {
      sourceAmount: quoteResponse.sourceAmount,
      destinationAmount: quoteResponse.destinationAmount,
      deadline: quoteResponse.deadline,
      encodedRoute: quoteResponse.encodedRoute,
    },
    contracts,
  };
}
