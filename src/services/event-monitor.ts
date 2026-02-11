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

// Chains with rate-limited free RPCs that need minimal RPC calls per poll
const RATE_LIMITED_CHAINS: SupportedChainName[] = ['polygon', 'ethereum', 'ronin'];

function isRateLimitedChain(chainName: SupportedChainName): boolean {
  return RATE_LIMITED_CHAINS.includes(chainName);
}

export class EventMonitor {
  private svmMonitor: SvmEventMonitor;

  constructor() {
    this.svmMonitor = new SvmEventMonitor();
  }

  /**
   * Wait for IntentFulfilled event on destination chain
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

    // For rate-limited chains: single range query per poll (2 RPC calls: getBlockNumber + getLogs)
    if (isRateLimitedChain(chainName)) {
      let lastCheckedBlock = await client.getBlockNumber();
      log.info({ chainName, startBlock: lastCheckedBlock }, 'Using range polling for rate-limited chain');
      return pollUntil(async () => {
        try {
          const currentBlock = await client.getBlockNumber();
          if (currentBlock < lastCheckedBlock) {
            return null;
          }
          log.info({ chainName, from: lastCheckedBlock, to: currentBlock, range: Number(currentBlock - lastCheckedBlock) }, 'Polling range');
          const logs = await client.getLogs({
            address: inboxAddress,
            event: INBOX_ABI[0],
            args: { intentHash },
            fromBlock: lastCheckedBlock,
            toBlock: currentBlock,
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
          lastCheckedBlock = currentBlock + 1n;
        } catch (error) {
          log.warn({ error, chainName }, 'RPC error on rate-limited chain, retrying...');
        }
        return null;
      }, options);
    }

    // For other chains: Use lookback range
    const currentBlock = await client.getBlockNumber();
    const startBlock = currentBlock > 100n ? currentBlock - 100n : 0n;

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

    // For rate-limited chains: single range query per poll
    if (isRateLimitedChain(chainName)) {
      let lastCheckedBlock = await client.getBlockNumber();
      log.info({ chainName, startBlock: lastCheckedBlock }, 'Using range polling for rate-limited chain (proven)');
      return pollUntil(async () => {
        try {
          const currentBlock = await client.getBlockNumber();
          if (currentBlock < lastCheckedBlock) {
            return null;
          }
          const logs = await client.getLogs({
            address: proverAddress,
            event: PROVER_ABI[0],
            args: { intentHash },
            fromBlock: lastCheckedBlock,
            toBlock: currentBlock,
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
          lastCheckedBlock = currentBlock + 1n;
        } catch (error) {
          log.warn({ error, chainName }, 'RPC error on rate-limited chain, retrying...');
        }
        return null;
      }, options);
    }

    // For other chains: Use lookback range
    const currentBlock = await client.getBlockNumber();
    const startBlock = currentBlock > 10n ? currentBlock - 10n : 0n;

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

    // For rate-limited chains: single range query per poll
    if (isRateLimitedChain(chainName)) {
      let lastCheckedBlock = await client.getBlockNumber();
      // Start 50 blocks back to catch events that happened between proof and now
      lastCheckedBlock = lastCheckedBlock > 50n ? lastCheckedBlock - 50n : 0n;
      log.info({ chainName, startBlock: lastCheckedBlock }, 'Using range polling for rate-limited chain (withdrawn)');
      return pollUntil(async () => {
        try {
          const currentBlock = await client.getBlockNumber();
          if (currentBlock < lastCheckedBlock) {
            return null;
          }
          log.info({ chainName, from: lastCheckedBlock, to: currentBlock, range: Number(currentBlock - lastCheckedBlock) }, 'Polling withdrawn range');
          const logs = await client.getLogs({
            address: intentSourceAddress,
            event: INTENT_SOURCE_ABI[0],
            args: { claimant: undefined },
            fromBlock: lastCheckedBlock,
            toBlock: currentBlock,
          });
          log.info({ chainName, logsFound: logs.length }, 'Logs found for withdrawn');

          const matchingLogs = logs.filter(
            (l) => (l.args as Record<string, unknown>).intentHash === intentHash
          );
          log.info({ chainName, matchingLogs: matchingLogs.length, intentHash }, 'Matching logs after filter');

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
          lastCheckedBlock = currentBlock + 1n;
        } catch (error) {
          log.warn({ error, chainName }, 'RPC error on rate-limited chain, retrying...');
        }
        return null;
      }, options);
    }

    // For other chains: Use lookback range
    const currentBlock = await client.getBlockNumber();
    const startBlock = currentBlock > 10n ? currentBlock - 10n : 0n;

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
