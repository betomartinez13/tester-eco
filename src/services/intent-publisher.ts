import type { Hash, Address, Hex } from 'viem';
import { decodeEventLog } from 'viem';
import { getWalletClient, getPublicClient } from '../clients/evm-client.js';
import type { IntentData } from '../types/intent.js';
import { getChainId } from '../config/chains.js';
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

export class IntentPublisher {

  /**
   * Publish and fund an intent using Portal.publishAndFund()
   * Note: Quote must be fetched BEFORE calling this function
   */
  async publishAndFund(data: IntentData): Promise<PublishResult> {
    const walletClient = getWalletClient(data.sourceChain);
    const publicClient = getPublicClient(data.sourceChain);

    const { quote } = data;
    const { contracts } = quote;

    log.info({
      sourceChain: data.sourceChain,
      destinationChain: data.destinationChain,
      sourceAmount: quote.sourceAmount,
      destinationAmount: quote.destinationAmount,
    }, 'Publishing and funding intent');

    // Step 1: Approve token spending to Portal
    log.info({
      token: data.sourceToken,
      portal: contracts.sourcePortal,
      amount: quote.sourceAmount
    }, 'Approving tokens');

    const approveTx = await walletClient.writeContract({
      address: data.sourceToken,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [contracts.sourcePortal, BigInt(quote.sourceAmount)],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    log.info({ approveTx }, 'Token approval confirmed');

    // Step 2: Build reward struct
    const reward = {
      deadline: BigInt(quote.deadline),
      creator: data.funder,
      prover: contracts.prover,
      nativeAmount: 0n, // No native token reward
      tokens: [
        {
          token: data.sourceToken,
          amount: BigInt(quote.sourceAmount),
        },
      ],
    };

    // Step 3: Call Portal.publishAndFund() to publish and fund in one transaction
    const destinationChainId = getChainId(data.destinationChain);
    log.info({
      destination: destinationChainId,
      deadline: quote.deadline,
    }, 'Calling Portal.publishAndFund()');

    const fundTx = await walletClient.writeContract({
      address: contracts.sourcePortal,
      abi: PORTAL_ABI,
      functionName: 'publishAndFund',
      args: [
        BigInt(destinationChainId),
        quote.encodedRoute,
        reward,
        false, // allowPartial
      ],
      value: 0n,
    });

    const fundReceipt = await publicClient.waitForTransactionReceipt({ hash: fundTx });

    // Extract intentHash from the transaction logs
    const intentHash = this.extractIntentHash(fundReceipt);

    log.info({ intentHash, fundTx }, 'Intent published and funded successfully');

    return {
      intentHash,
      txHash: fundTx,
      sourcePortal: contracts.sourcePortal,
      destinationPortal: contracts.destinationPortal,
      prover: contracts.prover,
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
