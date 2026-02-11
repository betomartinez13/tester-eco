import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Chain,
  type Transport,
  type Account,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  optimism,
  base,
  arbitrum,
  polygon,
  mainnet,
} from 'viem/chains';
import { Connection, Keypair, type ConnectionConfig } from '@solana/web3.js';
import bs58 from 'bs58';
import type { CircuitBreakerConfig } from './config.js';

// Solana mainnet chain ID (not a real EVM chain ID, used as a key)
export const SOLANA_CHAIN_ID = 1399811149;

// Ronin chain definition (not in viem/chains)
const ronin: Chain = {
  id: 2020,
  name: 'Ronin',
  nativeCurrency: { name: 'RON', symbol: 'RON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://api.roninchain.com/rpc'] },
  },
};

const CHAIN_BY_ID: Record<number, Chain> = {
  1: mainnet,
  10: optimism,
  137: polygon,
  2020: ronin,
  8453: base,
  42161: arbitrum,
};

// Chains that need rate-limited transports
const RATE_LIMITED_CHAIN_IDS = new Set([1, 137, 2020]);

type CbPublicClient = PublicClient<Transport, Chain>;
type CbWalletClient = WalletClient<Transport, Chain, Account>;

const publicClientCache = new Map<number, CbPublicClient>();
let walletClientCache = new Map<number, CbWalletClient>();

function getTransport(chainId: number, rpcUrl: string): Transport {
  if (RATE_LIMITED_CHAIN_IDS.has(chainId)) {
    return http(rpcUrl, {
      retryCount: 5,
      retryDelay: 12_000,
      timeout: 30_000,
    });
  }
  return http(rpcUrl);
}

export function getPublicClient(
  chainId: number,
  config: CircuitBreakerConfig,
): CbPublicClient {
  if (publicClientCache.has(chainId)) {
    return publicClientCache.get(chainId)!;
  }

  const chain = CHAIN_BY_ID[chainId];
  if (!chain) throw new Error(`Unsupported chain ID: ${chainId}`);

  const rpcUrl = config.rpc.urls[chainId.toString()];
  if (!rpcUrl) throw new Error(`No RPC URL configured for chain ${chainId}`);

  const client = createPublicClient({
    chain,
    transport: getTransport(chainId, rpcUrl),
    ...(RATE_LIMITED_CHAIN_IDS.has(chainId) && { pollingInterval: 15_000 }),
  });

  publicClientCache.set(chainId, client);
  return client;
}

export function getWalletClient(
  chainId: number,
  config: CircuitBreakerConfig,
): CbWalletClient {
  if (walletClientCache.has(chainId)) {
    return walletClientCache.get(chainId)!;
  }

  const chain = CHAIN_BY_ID[chainId];
  if (!chain) throw new Error(`Unsupported chain ID: ${chainId}`);

  const rpcUrl = config.rpc.urls[chainId.toString()];
  if (!rpcUrl) throw new Error(`No RPC URL configured for chain ${chainId}`);

  const account = privateKeyToAccount(
    config.wallet.privateKey as `0x${string}`,
  );

  const client = createWalletClient({
    chain,
    transport: getTransport(chainId, rpcUrl),
    account,
  });

  walletClientCache.set(chainId, client);
  return client;
}

export function clearClientCache(): void {
  publicClientCache.clear();
  walletClientCache.clear();
  solanaConnectionCache = null;
}

export function isRateLimitedChain(chainId: number): boolean {
  return RATE_LIMITED_CHAIN_IDS.has(chainId);
}

// ── Solana ────────────────────────────────────────────────────────────────────

const SOLANA_CONNECTION_CONFIG: ConnectionConfig = {
  commitment: 'finalized',
  confirmTransactionInitialTimeout: 60_000,
};

let solanaConnectionCache: Connection | null = null;

export function getSolanaConnection(config: CircuitBreakerConfig): Connection {
  if (!solanaConnectionCache) {
    const rpcUrl = config.rpc.urls[SOLANA_CHAIN_ID.toString()];
    if (!rpcUrl) throw new Error('No RPC URL configured for Solana');
    solanaConnectionCache = new Connection(rpcUrl, SOLANA_CONNECTION_CONFIG);
  }
  return solanaConnectionCache;
}

export function getSolanaKeypair(config: CircuitBreakerConfig): Keypair {
  const solanaKey = process.env.CB_SOLANA_PRIVATE_KEY ?? process.env.SOLANA_PRIVATE_KEY;
  if (!solanaKey) {
    throw new Error('CB_SOLANA_PRIVATE_KEY or SOLANA_PRIVATE_KEY env var required for Solana routes');
  }
  const bytes = bs58.decode(solanaKey);
  if (bytes.length !== 64) throw new Error('Solana private key must be 64 bytes (Base58)');
  return Keypair.fromSecretKey(bytes);
}

export function isSolanaChain(chainId: number): boolean {
  return chainId === SOLANA_CHAIN_ID;
}
