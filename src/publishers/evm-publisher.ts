/**
 * EVM Publisher
 *
 * Intent publishing implementation for EVM chains
 * (Optimism, Base, Arbitrum, etc.)
 */

import type { Hash, Address, Hex } from 'viem';
import { decodeEventLog } from 'viem';
import { getWalletClient, getPublicClient, isRateLimitedChain } from '../clients/evm-client.js';
import type { IntentData } from '../types/intent.js';
import { getChainId, type SupportedChainName } from '../config/chains.js';
import { createChildLogger } from '../utils/logger.js';
import { PORTAL_ABI, ERC20_ABI } from '../config/abis/index.js';
import { BasePublisher, type PublishResult } from './base-publisher.js';

const log = createChildLogger('EvmPublisher');

/**
 * EVM-specific intent publisher
 * Handles ERC20 approvals and Portal contract interactions
 */
export class EvmPublisher extends BasePublisher {
  /**
   * Publish and fund an intent using Portal.publishAndFund()
   * Note: Quote must be fetched BEFORE calling this function
   */
  async publishAndFund(data: IntentData): Promise<PublishResult> {
    const walletClient = getWalletClient(data.sourceChain as SupportedChainName);
    const publicClient = getPublicClient(data.sourceChain as SupportedChainName);

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

    // Get fresh nonce for approval transaction
    const approveNonce = await publicClient.getTransactionCount({
      address: walletClient.account.address,
    });

    const approveTx = await walletClient.writeContract({
      address: data.sourceToken as Address,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [contracts.sourcePortal as Address, BigInt(quote.sourceAmount)],
      nonce: approveNonce,
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    log.info({ approveTx, nonce: approveNonce }, 'Token approval confirmed');

    // Wait before next call on rate-limited chains to avoid RPC throttling
    if (isRateLimitedChain(data.sourceChain as SupportedChainName)) {
      log.info('Waiting 15s for rate-limited RPC before publishAndFund...');
      await new Promise(resolve => setTimeout(resolve, 15000));
    }

    // Step 2: Build reward struct
    const reward = {
      deadline: BigInt(quote.deadline),
      creator: data.funder as Address,
      prover: contracts.prover as Address,
      nativeAmount: 0n, // No native token reward
      tokens: [
        {
          token: data.sourceToken as Address,
          amount: BigInt(quote.sourceAmount),
        },
      ],
    };

    // Step 3: Call Portal.publishAndFund() to publish and fund in one transaction
    const destinationChainId = getChainId(data.destinationChain as SupportedChainName);
    log.info({
      destination: destinationChainId,
      deadline: quote.deadline,
    }, 'Calling Portal.publishAndFund()');

    // Use approveNonce + 1 for fund transaction (approval already consumed approveNonce)
    const fundNonce = approveNonce + 1;
    log.info({ approveNonce, fundNonce }, 'Using nonce for publishAndFund');

    const fundTx = await walletClient.writeContract({
      address: contracts.sourcePortal as Address,
      abi: PORTAL_ABI,
      functionName: 'publishAndFund',
      args: [
        BigInt(destinationChainId),
        quote.encodedRoute,
        reward,
        false, // allowPartial
      ],
      value: 0n,
      nonce: fundNonce,
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
   * Get ETH balance for an address
   */
  async getBalance(address: string): Promise<bigint> {
    // For now, return 0n - can be implemented if needed
    // Would need to determine which chain to check
    return 0n;
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
