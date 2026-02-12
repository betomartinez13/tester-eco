import type { Hex, Address } from 'viem';
import type { CircuitBreakerConfig } from './config.js';
import type { RouteDefinition } from '../schemas/route.schema.js';
import {
  getPublicClient,
  getWalletClient,
  isRateLimitedChain,
  getSolanaConnection,
  getSolanaKeypair,
  SOLANA_CHAIN_ID,
} from './clients.js';
import { fetchQuote } from './route-fetcher.js';
import { AddressNormalizer } from '../../../src/utils/address-normalizer.js';
import { ChainType } from '../../../src/types/chain.js';
import { getIntentHashFromReward } from '../../../src/utils/portal-hash.js';
import { executeFunding } from '../../../src/publishers/svm/svm-transaction.js';

// Minimal ABIs for EVM publishing
const ERC20_APPROVE_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

const PORTAL_PUBLISH_ABI = [
  {
    inputs: [
      { name: 'destination', type: 'uint64' },
      { name: 'route', type: 'bytes' },
      {
        name: 'reward',
        type: 'tuple',
        components: [
          { name: 'deadline', type: 'uint64' },
          { name: 'creator', type: 'address' },
          { name: 'prover', type: 'address' },
          { name: 'nativeAmount', type: 'uint256' },
          {
            name: 'tokens',
            type: 'tuple[]',
            components: [
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
        ],
      },
      { name: 'allowPartial', type: 'bool' },
    ],
    name: 'publishAndFund',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'intentHash', type: 'bytes32' },
      { indexed: true, name: 'creator', type: 'address' },
      { indexed: true, name: 'prover', type: 'address' },
      { indexed: false, name: 'destination', type: 'uint64' },
      { indexed: false, name: 'inbox', type: 'address' },
      { indexed: false, name: 'routeTokens', type: 'address[]' },
      { indexed: false, name: 'calls', type: 'tuple[]' },
      { indexed: false, name: 'expiry', type: 'uint256' },
    ],
    name: 'IntentCreated',
    type: 'event',
  },
] as const;

export interface PublishResult {
  intentHash: Hex;
  publishTxHash: Hex;
  sourcePortal: string;
  proverAddress: string;
}

/**
 * Publish an intent for any supported route (EVM or SVM source).
 * Fetches a fresh quote, then routes to the appropriate publisher.
 */
export async function publishIntent(
  config: CircuitBreakerConfig,
  route: RouteDefinition,
): Promise<PublishResult> {
  if (route.sourceChainId === SOLANA_CHAIN_ID) {
    return publishSvmIntent(config, route);
  }
  return publishEvmIntent(config, route);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Poll for a transaction receipt using short intervals, bypassing viem's default
 * watchBlockNumber logic which can fail on load-balanced RPCs where the backend
 * that receives the tx is different from the one queried for the receipt.
 */
async function waitForReceiptWithRetry(
  publicClient: ReturnType<typeof import('./clients.js').getPublicClient>,
  hash: Hex,
  chainId: number,
): Promise<ReturnType<typeof publicClient.waitForTransactionReceipt>> {
  // For slow/volatile chains, use short polling intervals to find receipts quickly
  const pollInterval = isRateLimitedChain(chainId) ? 3_000 : 2_000;
  const timeoutMs = isRateLimitedChain(chainId) ? 300_000 : 60_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash });
      if (receipt) return receipt as any;
    } catch {
      // not found yet, keep polling
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  throw new Error(
    `Transaction receipt with hash "${hash}" could not be found after ${timeoutMs / 1000}s`,
  );
}

// ─── EVM Source ───────────────────────────────────────────────────────────────

async function publishEvmIntent(
  config: CircuitBreakerConfig,
  route: RouteDefinition,
): Promise<PublishResult> {
  const { sourceChainId, destinationChainId } = route;

  const publicClient = getPublicClient(sourceChainId, config);
  const walletClient = getWalletClient(sourceChainId, config);
  const funder = walletClient.account.address;

  const { quoteItem, contracts } = await fetchQuote(config, route);

  const sourcePortal = contracts.sourcePortal as Address;
  const proverAddress = contracts.prover as Address;
  const sourceAmount = BigInt(quoteItem.sourceAmount);

  // Helper: get the next usable nonce, retrying if the RPC node is lagging
  async function getNextNonce(): Promise<number> {
    // Try pending first; fall back to latest if unsupported
    try {
      return await publicClient.getTransactionCount({ address: funder, blockTag: 'pending' });
    } catch {
      return await publicClient.getTransactionCount({ address: funder });
    }
  }

  // For volatile chains (Polygon), fetch current gas price and apply a 2x multiplier
  // to ensure txs are included promptly rather than sitting in mempool
  async function getGasOverrides(): Promise<{ maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint } | undefined> {
    if (!isRateLimitedChain(sourceChainId)) return undefined;
    try {
      const gasPrice = await publicClient.getGasPrice();
      // 2x multiplier to handle volatile gas markets
      return { maxFeePerGas: gasPrice * 2n, maxPriorityFeePerGas: 50n * 10n ** 9n };
    } catch {
      return undefined;
    }
  }

  // 1. Approve token spending (retry nonce if RPC returns stale value)
  let approveNonce = await getNextNonce();
  const gasOverrides = await getGasOverrides();
  let approveTx: Hex;
  while (true) {
    try {
      approveTx = await walletClient.writeContract({
        address: route.sourceToken as Address,
        abi: ERC20_APPROVE_ABI,
        functionName: 'approve',
        args: [sourcePortal, sourceAmount],
        nonce: approveNonce,
        ...gasOverrides,
      });
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('nonce') && msg.toLowerCase().includes('lower')) {
        approveNonce++;
        continue;
      }
      throw err;
    }
  }
  // Rate-limited chains (Polygon) use custom polling to work around load-balanced RPC
  // propagation delays (tx submitted to backend A, receipt queried from backend B)
  await waitForReceiptWithRetry(publicClient, approveTx!, sourceChainId);

  if (isRateLimitedChain(sourceChainId)) {
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }

  // 2. Call Portal.publishAndFund() (retry nonce if RPC returns stale value)
  const reward = {
    deadline: BigInt(quoteItem.deadline),
    creator: funder,
    prover: proverAddress,
    nativeAmount: 0n,
    tokens: [{ token: route.sourceToken as Address, amount: sourceAmount }],
  };

  let publishNonce = await getNextNonce();
  let publishTx: Hex;
  while (true) {
    try {
      publishTx = await walletClient.writeContract({
        address: sourcePortal,
        abi: PORTAL_PUBLISH_ABI,
        functionName: 'publishAndFund',
        args: [BigInt(destinationChainId), quoteItem.encodedRoute as Hex, reward, false],
        nonce: publishNonce,
        ...gasOverrides,
      });
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('nonce') && msg.toLowerCase().includes('lower')) {
        publishNonce++;
        continue;
      }
      throw err;
    }
  }

  const receipt = await waitForReceiptWithRetry(publicClient, publishTx, sourceChainId);

  // 3. Extract intentHash from portal event log.
  // The intentHash is always topics[1] (first indexed param) in logs emitted by the portal.
  // We match by portal address to be safe across contract versions.
  let intentHash: Hex | undefined;
  for (const logEntry of receipt.logs) {
    if (
      logEntry.address.toLowerCase() === sourcePortal.toLowerCase() &&
      logEntry.topics.length >= 2
    ) {
      intentHash = logEntry.topics[1] as Hex;
      break;
    }
  }

  if (!intentHash) {
    throw new Error(`Portal event not found in tx ${publishTx}`);
  }

  return {
    intentHash,
    publishTxHash: publishTx,
    sourcePortal: contracts.sourcePortal,
    proverAddress: contracts.prover,
  };
}

// ─── SVM Source ───────────────────────────────────────────────────────────────

async function publishSvmIntent(
  config: CircuitBreakerConfig,
  route: RouteDefinition,
): Promise<PublishResult> {
  const { sourceChainId, destinationChainId } = route;

  const connection = getSolanaConnection(config);
  const keypair = getSolanaKeypair(config);

  const { quoteItem, contracts } = await fetchQuote(config, route);

  // Normalize addresses to UniversalAddress (32-byte hex) for hash calculation
  const sourceToken = AddressNormalizer.normalize(route.sourceToken, ChainType.SVM);
  const funder = AddressNormalizer.normalize(keypair.publicKey.toBase58(), ChainType.SVM);
  const prover = AddressNormalizer.normalize(contracts.prover, ChainType.SVM);

  const rewardForHash = {
    deadline: BigInt(quoteItem.deadline),
    creator: funder,
    prover,
    nativeAmount: '0',
    tokens: [{ token: sourceToken, amount: quoteItem.sourceAmount }],
  };

  // Calculate intent hash (Borsh encoding for SVM source chain)
  const { intentHash, routeHash, rewardHash } = getIntentHashFromReward(
    BigInt(sourceChainId),
    BigInt(destinationChainId),
    quoteItem.encodedRoute as Hex,
    rewardForHash,
  );

  // Execute the Solana funding transaction
  const result = await executeFunding({
    connection,
    keypair,
    intentHash,
    routeHash,
    rewardHash,
    destination: BigInt(destinationChainId),
    encodedRoute: quoteItem.encodedRoute,
    reward: {
      deadline: BigInt(quoteItem.deadline),
      creator: funder as string,
      prover: prover as string,
      nativeAmount: '0',
      tokens: [{ token: sourceToken as string, amount: quoteItem.sourceAmount }],
    },
    portalAddress: contracts.sourcePortal,
  });

  if (!result.success) {
    throw new Error(`Solana funding transaction failed for ${intentHash}`);
  }

  return {
    intentHash,
    publishTxHash: result.signature as Hex,
    sourcePortal: contracts.sourcePortal,
    proverAddress: contracts.prover,
  };
}
