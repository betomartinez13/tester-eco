import type { Hash, Log, Address } from 'viem';
import { getPublicClient } from '../clients/evm-client.js';
import { INBOX_ABI, PROVER_ABI, INTENT_SOURCE_ABI } from '../config/contracts.js';
import type { SupportedChainName } from '../config/chains.js';
import { getChainConfig } from '../config/chains.js';
import { ChainType } from '../types/chain.js';
import { pollUntil, type PollOptions } from '../utils/polling.js';
import { createChildLogger } from '../utils/logger.js';
import { SvmEventMonitor } from './svm-event-monitor.js';

const log = createChildLogger('EventMonitor');

export interface EventResult {
  log: Log;
  blockNumber: bigint;
  transactionHash: Hash;
  args: Record<string, unknown>;
}

export interface MonitorAddresses {
  sourcePortal: Address;
  destinationPortal: Address;
  prover: Address;
}

export class EventMonitor {
  private svmMonitor: SvmEventMonitor;

  constructor() {
    this.svmMonitor = new SvmEventMonitor();
  }

  /**
   * Wait for IntentFulfilled event on destination chain
   * @param intentHash - The intent hash to watch for
   * @param chainName - Destination chain (base, arbitrum, or solana)
   * @param inboxAddress - From quote response (contracts.destinationPortal)
   * @param options - Polling options (interval, timeout)
   */
  async waitForFulfilled(
    intentHash: Hash,
    chainName: SupportedChainName,
    inboxAddress: Address,
    options: PollOptions
  ): Promise<EventResult | null> {
    log.info({ intentHash, chain: chainName, inbox: inboxAddress }, 'Waiting for IntentFulfilled');

    // Route to SVM monitor for Solana chains
    const chainConfig = getChainConfig(chainName);
    if (chainConfig.type === ChainType.SVM) {
      return this.svmMonitor.waitForFulfilled(intentHash, inboxAddress, options);
    }

    // EVM chain monitoring
    const client = getPublicClient(chainName);
    const startBlock = await client.getBlockNumber();

    return pollUntil(async () => {
      const logs = await client.getLogs({
        address: inboxAddress,
        event: INBOX_ABI[0], // IntentFulfilled event
        args: { intentHash },
        fromBlock: startBlock,
        toBlock: 'latest',
      });

      if (logs.length > 0) {
        const logEntry = logs[0];
        log.info({ intentHash, blockNumber: logEntry.blockNumber }, 'IntentFulfilled found');
        return {
          log: logEntry,
          blockNumber: logEntry.blockNumber!,
          transactionHash: logEntry.transactionHash!,
          args: logEntry.args as Record<string, unknown>,
        };
      }
      return null;
    }, options);
  }

  /**
   * Poll for IntentProven event on source chain
   * @param intentHash - The intent hash to watch for
   * @param chainName - Source chain (optimism or solana)
   * @param proverAddress - From quote response (contracts.prover)
   * @param options - Polling options (interval, timeout)
   */
  async pollForProven(
    intentHash: Hash,
    chainName: SupportedChainName,
    proverAddress: Address,
    options: PollOptions
  ): Promise<EventResult | null> {
    log.info({ intentHash, chain: chainName, prover: proverAddress }, 'Polling for IntentProven');

    // Route to SVM monitor for Solana chains
    const chainConfig = getChainConfig(chainName);
    if (chainConfig.type === ChainType.SVM) {
      return this.svmMonitor.pollForProven(intentHash, proverAddress, options);
    }

    // EVM chain monitoring
    const client = getPublicClient(chainName);
    const startBlock = await client.getBlockNumber();

    return pollUntil(async () => {
      const logs = await client.getLogs({
        address: proverAddress,
        event: PROVER_ABI[0], // IntentProven event
        args: { intentHash },
        fromBlock: startBlock,
        toBlock: 'latest',
      });

      if (logs.length > 0) {
        const logEntry = logs[0];
        log.info({ intentHash, blockNumber: logEntry.blockNumber }, 'IntentProven found');
        return {
          log: logEntry,
          blockNumber: logEntry.blockNumber!,
          transactionHash: logEntry.transactionHash!,
          args: logEntry.args as Record<string, unknown>,
        };
      }
      return null;
    }, options);
  }

  /**
   * Poll for IntentWithdrawn event on source chain
   * @param intentHash - The intent hash to watch for
   * @param chainName - Source chain (optimism or solana)
   * @param intentSourceAddress - From quote response (contracts.sourcePortal)
   * @param options - Polling options (interval, timeout)
   */
  async pollForWithdrawn(
    intentHash: Hash,
    chainName: SupportedChainName,
    intentSourceAddress: Address,
    options: PollOptions
  ): Promise<EventResult | null> {
    log.info({ intentHash, chain: chainName, intentSource: intentSourceAddress }, 'Polling for IntentWithdrawn');

    // Route to SVM monitor for Solana chains
    const chainConfig = getChainConfig(chainName);
    if (chainConfig.type === ChainType.SVM) {
      return this.svmMonitor.pollForWithdrawn(intentHash, intentSourceAddress, options);
    }

    // EVM chain monitoring
    const client = getPublicClient(chainName);
    const startBlock = await client.getBlockNumber();

    return pollUntil(async () => {
      const logs = await client.getLogs({
        address: intentSourceAddress,
        event: INTENT_SOURCE_ABI[0], // IntentWithdrawn event
        args: { claimant: undefined }, // IntentWithdrawn filters by claimant, not intentHash
        fromBlock: startBlock,
        toBlock: 'latest',
      });

      // Filter logs by intentHash in the args (since it's not indexed)
      const matchingLogs = logs.filter(
        (l) => (l.args as Record<string, unknown>).intentHash === intentHash
      );

      if (matchingLogs.length > 0) {
        const logEntry = matchingLogs[0];
        log.info({ intentHash, blockNumber: logEntry.blockNumber }, 'IntentWithdrawn found');
        return {
          log: logEntry,
          blockNumber: logEntry.blockNumber!,
          transactionHash: logEntry.transactionHash!,
          args: logEntry.args as Record<string, unknown>,
        };
      }
      return null;
    }, options);
  }
}

export function getEventMonitor(): EventMonitor {
  return new EventMonitor();
}
