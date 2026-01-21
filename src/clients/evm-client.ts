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

function getRpcUrl(chainName: SupportedChainName): string {
  const config = getConfig();
  const urls: Record<SupportedChainName, string> = {
    optimism: config.optimismRpcUrl,
    base: config.baseRpcUrl,
    arbitrum: config.arbitrumRpcUrl,
  };
  return urls[chainName];
}

export function getPublicClient(chainName: SupportedChainName): PublicClient<Transport, Chain> {
  let client = clientCache.get(chainName);
  if (!client) {
    client = createPublicClient({
      chain: CHAINS[chainName],
      transport: http(getRpcUrl(chainName)),
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
    transport: http(getRpcUrl(chainName)),
    account,
  });
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
