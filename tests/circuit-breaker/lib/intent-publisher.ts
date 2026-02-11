import type { Hex, Address } from 'viem';
import { decodeEventLog } from 'viem';
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

  // 1. Approve token spending
  const approveNonce = await publicClient.getTransactionCount({ address: funder });
  const approveTx = await walletClient.writeContract({
    address: route.sourceToken as Address,
    abi: ERC20_APPROVE_ABI,
    functionName: 'approve',
    args: [sourcePortal, sourceAmount],
    nonce: approveNonce,
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });

  if (isRateLimitedChain(sourceChainId)) {
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }

  // 2. Call Portal.publishAndFund()
  const reward = {
    deadline: BigInt(quoteItem.deadline),
    creator: funder,
    prover: proverAddress,
    nativeAmount: 0n,
    tokens: [{ token: route.sourceToken as Address, amount: sourceAmount }],
  };

  const publishNonce = await publicClient.getTransactionCount({ address: funder });
  const publishTx = await walletClient.writeContract({
    address: sourcePortal,
    abi: PORTAL_PUBLISH_ABI,
    functionName: 'publishAndFund',
    args: [BigInt(destinationChainId), quoteItem.encodedRoute as Hex, reward],
    nonce: publishNonce,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: publishTx });

  // 3. Extract intentHash from IntentCreated event
  let intentHash: Hex | undefined;
  for (const logEntry of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: PORTAL_PUBLISH_ABI,
        eventName: 'IntentCreated',
        data: logEntry.data,
        topics: logEntry.topics,
      });
      intentHash = (decoded.args as { intentHash: Hex }).intentHash;
      break;
    } catch {
      // not this event
    }
  }

  if (!intentHash) {
    throw new Error(`IntentCreated event not found in tx ${publishTx}`);
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
