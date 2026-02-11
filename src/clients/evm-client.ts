import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type Chain,
  type Transport,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { CHAINS, type SupportedChainName } from '../config/chains.js';
import { getConfig } from '../config/index.js';

const clientCache = new Map<SupportedChainName, PublicClient<Transport, Chain>>();

// Chains with rate-limited free RPCs that need higher retry counts and delays
const RATE_LIMITED_CHAINS: SupportedChainName[] = ['polygon', 'ethereum', 'ronin'];

function getRpcUrl(chainName: SupportedChainName): string {
  const config = getConfig();
  const urls: Record<SupportedChainName, string> = {
    optimism: config.optimismRpcUrl,
    base: config.baseRpcUrl,
    arbitrum: config.arbitrumRpcUrl,
    solana: config.solanaRpcUrl, // Not used in EVM client, handled by SVM client
    ethereum: config.ethereumRpcUrl,
    polygon: config.polygonRpcUrl,
    ronin: config.roninRpcUrl,
    ink: config.inkRpcUrl,
  };
  return urls[chainName];
}

function getHttpTransport(chainName: SupportedChainName) {
  const url = getRpcUrl(chainName);
  if (RATE_LIMITED_CHAINS.includes(chainName)) {
    return http(url, {
      retryCount: 5,
      retryDelay: 12000, // 12s between retries for rate-limited RPCs
      timeout: 30000,
    });
  }
  return http(url);
}

export function getPublicClient(chainName: SupportedChainName): PublicClient<Transport, Chain> {
  let client = clientCache.get(chainName);
  if (!client) {
    const isRateLimited = RATE_LIMITED_CHAINS.includes(chainName);
    client = createPublicClient({
      chain: CHAINS[chainName],
      transport: getHttpTransport(chainName),
      ...(isRateLimited && {
        pollingInterval: 15000,
      }),
    });
    clientCache.set(chainName, client);
  }
  return client;
}

export function getWalletClient(chainName: SupportedChainName) {
  const config = getConfig();
  const account = privateKeyToAccount(config.privateKey as `0x${string}`);

  return createWalletClient({
    chain: CHAINS[chainName],
    transport: getHttpTransport(chainName),
    account,
  });
}

export function isRateLimitedChain(chainName: SupportedChainName): boolean {
  return RATE_LIMITED_CHAINS.includes(chainName);
}

export async function testConnection(chainName: SupportedChainName): Promise<boolean> {
  try {
    const client = getPublicClient(chainName);
    await client.getBlockNumber();
    return true;
  } catch {
    return false;
  }
}
