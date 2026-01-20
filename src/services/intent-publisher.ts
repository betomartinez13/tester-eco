import type { Hash, Address, Hex } from 'viem';
import { decodeEventLog } from 'viem';
import { getWalletClient, getPublicClient } from '../clients/evm-client.js';
import { SolverClient, isQuoteSuccess } from '../clients/solver-client.js';
import type { IntentData } from '../types/intent.js';
import type { SupportedChainName } from '../config/chains.js';
import { createChildLogger } from '../utils/logger.js';
import { PORTAL_ABI, ERC20_ABI } from '../config/abis/index.js';

const log = createChildLogger('IntentPublisher');

export interface PublishResult {
  intentHash: Hash;
  txHash: Hash;
  sourcePortal: Address;
  destinationPortal: Address;
  prover: Address;
}

// Token addresses for USDC on each chain
const USDC_ADDRESSES: Record<SupportedChainName, Address> = {
  optimism: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
};

// Chain IDs
const CHAIN_IDS: Record<SupportedChainName, number> = {
  optimism: 10,
  base: 8453,
  arbitrum: 42161,
};

export class IntentPublisher {
  private solverClient: SolverClient;

  constructor() {
    this.solverClient = new SolverClient();
  }

  /**
   * Publish and fund an intent using direct Portal.fund() contract call
   */
  async publishAndFund(data: IntentData): Promise<PublishResult> {
    const walletClient = getWalletClient(data.sourceChain);
    const publicClient = getPublicClient(data.sourceChain);
    const walletAddress = walletClient.account.address;

    const sourceToken = USDC_ADDRESSES[data.sourceChain];
    const destToken = USDC_ADDRESSES[data.destinationChain];

    // Get quote from solver to obtain contract addresses and route
    log.info({ data }, 'Getting quote from solver');
    const quoteRequest = this.solverClient.buildQuoteRequest({
      sourceChainID: CHAIN_IDS[data.sourceChain],
      destinationChainID: CHAIN_IDS[data.destinationChain],
      sourceToken,
      destinationToken: destToken,
      sourceAmount: data.amount,
      funder: walletAddress,
      recipient: walletAddress,
    });

    const quoteResponse = await this.solverClient.getQuote(quoteRequest);

    if (!isQuoteSuccess(quoteResponse)) {
      throw new Error(`Quote failed: ${JSON.stringify(quoteResponse.validations.failed)}`);
    }

    const quote = quoteResponse.quoteResponses[0];
    const contracts = quoteResponse.contracts;

    log.info({
      sourcePortal: contracts.sourcePortal,
      prover: contracts.prover,
      deadline: quote.deadline,
    }, 'Quote received');

    // Step 1: Approve token spending to Portal
    log.info({ sourceToken, portal: contracts.sourcePortal, amount: data.amount }, 'Approving tokens');
    const approveTx = await walletClient.writeContract({
      address: sourceToken,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [contracts.sourcePortal as Address, BigInt(data.amount)],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    log.info({ approveTx }, 'Token approval confirmed');

    // Step 2: Build reward struct
    const reward = {
      deadline: BigInt(quote.deadline),
      creator: walletAddress,
      prover: contracts.prover as Address,
      nativeAmount: 0n, // No native token reward
      tokens: [
        {
          token: sourceToken,
          amount: BigInt(data.amount),
        },
      ],
    };

    // Step 3: Call Portal.publishAndFund() to publish and fund in one transaction
    log.info({
      destination: CHAIN_IDS[data.destinationChain],
      deadline: quote.deadline,
    }, 'Calling Portal.publishAndFund()');

    const fundTx = await walletClient.writeContract({
      address: contracts.sourcePortal as Address,
      abi: PORTAL_ABI,
      functionName: 'publishAndFund',
      args: [
        BigInt(CHAIN_IDS[data.destinationChain]),
        quote.encodedRoute as Hex, // Raw route bytes (not hashed)
        reward,
        false, // allowPartial
      ],
      value: 0n,
    });

    const fundReceipt = await publicClient.waitForTransactionReceipt({ hash: fundTx });

    // Extract intentHash from the transaction logs
    // The fund function returns intentHash and emits an event
    const intentHash = this.extractIntentHash(fundReceipt);

    log.info({ intentHash, fundTx }, 'Intent published and funded successfully');

    return {
      intentHash,
      txHash: fundTx,
      sourcePortal: contracts.sourcePortal as Address,
      destinationPortal: contracts.destinationPortal as Address,
      prover: contracts.prover as Address,
    };
  }


  /**
   * Extract intentHash from publishAndFund transaction receipt
   * IntentPublished event: (bytes32 intentHash) - non-indexed
   */
  private extractIntentHash(receipt: { logs: readonly { topics: Hex[]; data: Hex }[] }): Hash {
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: PORTAL_ABI,
          data: log.data,
          topics: log.topics as [Hex, ...Hex[]],
        });

        if (decoded.eventName === 'IntentPublished' && decoded.args) {
          const args = decoded.args as unknown as { intentHash: Hash };
          return args.intentHash;
        }
      } catch {
        // Not the event we're looking for, continue
      }
    }
    throw new Error('Could not find IntentPublished event in transaction logs');
  }
}

export function getIntentPublisher(): IntentPublisher {
  return new IntentPublisher();
}
