# Phase 4: Event Monitoring

## Overview

Build polling utilities and event monitor service to track IntentFulfilled, IntentProven, and IntentWithdrawn events.

## Changes Required

### 1. Polling Utilities

**File**: `src/utils/polling.ts`

```typescript
import { createChildLogger } from './logger.js';

const log = createChildLogger('Polling');

export interface PollOptions {
  interval: number;  // ms between polls
  timeout: number;   // max wait time in ms
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollUntil<T>(
  fn: () => Promise<T | null>,
  options: PollOptions
): Promise<T | null> {
  const { interval, timeout } = options;
  const startTime = Date.now();
  let attempt = 0;

  while (Date.now() - startTime < timeout) {
    attempt++;
    try {
      const result = await fn();
      if (result !== null) {
        log.debug({ attempt, elapsed: Date.now() - startTime }, 'Poll succeeded');
        return result;
      }
    } catch (error) {
      log.warn({ attempt, error }, 'Poll attempt failed');
    }

    if (Date.now() - startTime + interval < timeout) {
      await sleep(interval);
    }
  }

  log.warn({ attempts: attempt, timeout }, 'Poll timed out');
  return null;
}
```

### 2. Intent Types

**File**: `src/types/intent.ts`

```typescript
import type { Hash, Address } from 'viem';
import type { SupportedChainName } from '../config/chains.js';

export type IntentState =
  | 'PUBLISHED'
  | 'FUNDED'
  | 'FULFILLED'
  | 'PROVEN'
  | 'WITHDRAWN'
  | 'FAILED';

export interface IntentData {
  sourceChain: SupportedChainName;
  destinationChain: SupportedChainName;
  token: string;
  amount: string;
  reward: string;
}

export interface IntentStateRecord {
  state: IntentState;
  timestamp: Date;
  txHash?: Hash;
  blockNumber?: bigint;
  solver?: Address;
}

export interface IntentJourney {
  intentHash: Hash;
  route: string;
  states: IntentStateRecord[];
  currentState: IntentState;
  isComplete: boolean;
  error?: string;
}
```

### 3. Event Monitor Service

**File**: `src/services/event-monitor.ts`

Contract addresses are passed as parameters (from quote response), not from config.

```typescript
import type { Hash, Log, Address } from 'viem';
import { getPublicClient } from '../clients/evm-client.js';
import { PORTAL_ABI, PROVER_ABI } from '../config/contracts.js';
import type { SupportedChainName } from '../config/chains.js';
import { pollUntil, type PollOptions } from '../utils/polling.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('EventMonitor');

export interface EventResult {
  log: Log;
  blockNumber: bigint;
  args: Record<string, unknown>;
}

export interface MonitorAddresses {
  sourcePortal: Address;
  sourceProver: Address;
  destinationPortal: Address;
}

export class EventMonitor {
  /**
   * Wait for IntentFulfilled event on destination chain
   * @param portalAddress - From quote response (contracts.destinationPortal)
   */
  async waitForFulfilled(
    intentHash: Hash,
    chainName: SupportedChainName,
    portalAddress: Address,
    options: PollOptions
  ): Promise<EventResult | null> {
    log.info({ intentHash, chain: chainName, portal: portalAddress }, 'Waiting for IntentFulfilled');

    const client = getPublicClient(chainName);
    const startBlock = await client.getBlockNumber();

    return pollUntil(async () => {
      const logs = await client.getLogs({
        address: portalAddress,
        event: PORTAL_ABI[0], // IntentFulfilled
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
          args: logEntry.args as Record<string, unknown>,
        };
      }
      return null;
    }, options);
  }

  /**
   * Poll for IntentProven event on source chain
   * @param proverAddress - From quote response (contracts.sourceProver)
   */
  async pollForProven(
    intentHash: Hash,
    chainName: SupportedChainName,
    proverAddress: Address,
    options: PollOptions
  ): Promise<EventResult | null> {
    log.info({ intentHash, chain: chainName, prover: proverAddress }, 'Polling for IntentProven');

    const client = getPublicClient(chainName);
    const startBlock = await client.getBlockNumber();

    return pollUntil(async () => {
      const logs = await client.getLogs({
        address: proverAddress,
        event: PROVER_ABI[0], // IntentProven
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
          args: logEntry.args as Record<string, unknown>,
        };
      }
      return null;
    }, options);
  }

  /**
   * Poll for IntentWithdrawn event on source chain
   * @param portalAddress - From quote response (contracts.sourcePortal)
   */
  async pollForWithdrawn(
    intentHash: Hash,
    chainName: SupportedChainName,
    portalAddress: Address,
    options: PollOptions
  ): Promise<EventResult | null> {
    log.info({ intentHash, chain: chainName, portal: portalAddress }, 'Polling for IntentWithdrawn');

    const client = getPublicClient(chainName);
    const startBlock = await client.getBlockNumber();

    return pollUntil(async () => {
      const logs = await client.getLogs({
        address: portalAddress,
        event: PORTAL_ABI[1], // IntentWithdrawn
        args: { intentHash },
        fromBlock: startBlock,
        toBlock: 'latest',
      });

      if (logs.length > 0) {
        const logEntry = logs[0];
        log.info({ intentHash, blockNumber: logEntry.blockNumber }, 'IntentWithdrawn found');
        return {
          log: logEntry,
          blockNumber: logEntry.blockNumber!,
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
```

### 4. Polling Unit Tests

**File**: `tests/unit/polling.test.ts`

```typescript
import { pollUntil, sleep } from '../../src/utils/polling.js';

describe('Polling Utilities', () => {
  describe('sleep', () => {
    it('should sleep for specified duration', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(elapsed).toBeLessThan(200);
    });
  });

  describe('pollUntil', () => {
    it('should return result when condition is met', async () => {
      let attempts = 0;
      const result = await pollUntil(async () => {
        attempts++;
        return attempts >= 3 ? 'success' : null;
      }, { interval: 50, timeout: 5000 });

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should return null on timeout', async () => {
      const result = await pollUntil(
        async () => null,
        { interval: 50, timeout: 200 }
      );
      expect(result).toBeNull();
    });

    it('should continue polling after errors', async () => {
      let attempts = 0;
      const result = await pollUntil(async () => {
        attempts++;
        if (attempts < 3) throw new Error('Not yet');
        return 'success';
      }, { interval: 50, timeout: 5000 });

      expect(result).toBe('success');
    });
  });
});
```

## Directory Structure After Phase 4

```
testereco/
├── src/
│   ├── config/
│   │   └── ...
│   ├── clients/
│   │   └── ...
│   ├── services/
│   │   └── event-monitor.ts
│   ├── types/
│   │   └── intent.ts
│   ├── utils/
│   │   ├── logger.ts
│   │   └── polling.ts
│   └── index.ts
├── tests/
│   ├── unit/
│   │   ├── solver-client.test.ts
│   │   └── polling.test.ts
│   ├── integration/
│   │   └── ...
│   └── setup.ts
└── ...
```

## Success Criteria

### Automated Verification:
- [ ] `npm run typecheck` passes
- [ ] `npm run test:unit -- polling` passes

### Manual Verification:
- [ ] Event monitor can be instantiated without errors
- [ ] Polling logic works as expected

**Next Phase**: Proceed to `05-state-reporting.md` after verification.
