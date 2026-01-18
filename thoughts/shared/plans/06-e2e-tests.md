# Phase 6: Intent Publishing & E2E Tests

## Overview

Integrate routes-cli for intent publishing and build full E2E lifecycle tests.

## Changes Required

### 1. Add routes-cli Dependency

First, investigate how to integrate routes-cli:

**Option A**: Install as npm package (if published)
```bash
npm install @eco/routes-cli
```

**Option B**: Clone and link locally
```bash
git clone https://github.com/eco/routes-cli.git ../routes-cli
cd ../routes-cli && npm install && npm link
cd ../testereco && npm link @eco/routes-cli
```

**Option C**: Use as subprocess (simplest, most reliable)
- Clone routes-cli
- Call via `spawn` or `exec`

### 2. Intent Publisher Service

**File**: `src/services/intent-publisher.ts`

```typescript
import { spawn } from 'child_process';
import type { Hash } from 'viem';
import type { IntentData } from '../types/intent.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('IntentPublisher');

export interface PublishResult {
  intentHash: Hash;
  txHash: Hash;
}

export class IntentPublisher {
  private cliPath: string;

  constructor(cliPath?: string) {
    // Path to routes-cli directory or executable
    this.cliPath = cliPath || process.env.ROUTES_CLI_PATH || '../routes-cli';
  }

  /**
   * Publish an intent using routes-cli
   */
  async publish(data: IntentData): Promise<PublishResult> {
    log.info({ data }, 'Publishing intent');

    // Option C: Subprocess approach
    // Adapt based on actual routes-cli CLI interface
    return new Promise((resolve, reject) => {
      const args = [
        'publish',
        '--source', data.sourceChain,
        '--destination', data.destinationChain,
        '--token', data.token,
        '--amount', data.amount,
        '--reward', data.reward,
        '--json', // Assume JSON output flag
      ];

      const child = spawn('pnpm', ['dev', ...args], {
        cwd: this.cliPath,
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => { stdout += data; });
      child.stderr.on('data', (data) => { stderr += data; });

      child.on('close', (code) => {
        if (code !== 0) {
          log.error({ code, stderr }, 'Publish failed');
          reject(new Error(`Publish failed: ${stderr}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          log.info({ intentHash: result.intentHash }, 'Intent published');
          resolve({
            intentHash: result.intentHash as Hash,
            txHash: result.txHash as Hash,
          });
        } catch (e) {
          reject(new Error(`Failed to parse output: ${stdout}`));
        }
      });
    });
  }

  /**
   * Fund an intent using routes-cli
   */
  async fund(intentHash: Hash, data: IntentData): Promise<{ txHash: Hash }> {
    log.info({ intentHash }, 'Funding intent');

    return new Promise((resolve, reject) => {
      const args = [
        'fund',
        '--intent', intentHash,
        '--json',
      ];

      const child = spawn('pnpm', ['dev', ...args], {
        cwd: this.cliPath,
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => { stdout += data; });
      child.stderr.on('data', (data) => { stderr += data; });

      child.on('close', (code) => {
        if (code !== 0) {
          log.error({ code, stderr }, 'Fund failed');
          reject(new Error(`Fund failed: ${stderr}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          log.info({ intentHash, txHash: result.txHash }, 'Intent funded');
          resolve({ txHash: result.txHash as Hash });
        } catch (e) {
          reject(new Error(`Failed to parse output: ${stdout}`));
        }
      });
    });
  }
}

export function getIntentPublisher(): IntentPublisher {
  return new IntentPublisher();
}
```

**Note**: The above implementation is a template. You'll need to:
1. Study routes-cli's actual CLI commands and arguments
2. Adapt the spawn arguments accordingly
3. Parse the actual output format

### 3. E2E Lifecycle Test

**File**: `tests/e2e/intent-lifecycle.test.ts`

```typescript
import { EventMonitor } from '../../src/services/event-monitor.js';
import { StateValidator } from '../../src/services/state-validator.js';
import { IntentReporter } from '../../src/reporters/intent-reporter.js';
import { IntentPublisher } from '../../src/services/intent-publisher.js';
import { SolverClient } from '../../src/clients/solver-client.js';
import type { Hash } from 'viem';

// Skip E2E tests unless explicitly enabled
const runE2E = process.env.RUN_E2E === 'true';
const describeE2E = runE2E ? describe : describe.skip;

describeE2E('Intent Lifecycle E2E', () => {
  let publisher: IntentPublisher;
  let monitor: EventMonitor;
  let validator: StateValidator;
  let reporter: IntentReporter;
  let solverClient: SolverClient;

  beforeAll(async () => {
    publisher = new IntentPublisher();
    monitor = new EventMonitor();
    validator = new StateValidator();
    reporter = new IntentReporter();
    solverClient = new SolverClient();

    // Verify solver is healthy
    const health = await solverClient.health();
    if (health.status !== 'ok') {
      throw new Error('Solver is not healthy');
    }
  });

  afterAll(async () => {
    reporter.printSummary();
    reporter.saveReport();
  });

  jest.setTimeout(600000); // 10 minutes

  it('should complete Optimism → Base lifecycle', async () => {
    const intentData = {
      sourceChain: 'optimism' as const,
      destinationChain: 'base' as const,
      token: 'USDC',
      amount: '1000000',  // 1 USDC
      reward: '100000',   // 0.1 USDC
    };

    // Step 0: Get contract addresses from quote response
    const contracts = await solverClient.getContractAddresses(10, 8453); // Optimism → Base
    const { sourcePortal, sourceProver, destinationPortal } = contracts;

    // Step 1: Publish intent
    const { intentHash, txHash: publishTx } = await publisher.publish(intentData);
    validator.initializeIntent(intentHash, 'optimism', 'base');
    validator.recordState(intentHash, {
      state: 'PUBLISHED',
      timestamp: new Date(),
      txHash: publishTx,
    });

    // Step 2: Fund intent
    const { txHash: fundTx } = await publisher.fund(intentHash, intentData);
    validator.recordState(intentHash, {
      state: 'FUNDED',
      timestamp: new Date(),
      txHash: fundTx,
    });

    // Step 3: Wait for FULFILLED on Base (destination)
    const fulfilled = await monitor.waitForFulfilled(
      intentHash,
      'base',
      destinationPortal as `0x${string}`,
      { interval: 5000, timeout: 120000 }
    );
    expect(fulfilled).not.toBeNull();
    validator.recordState(intentHash, {
      state: 'FULFILLED',
      timestamp: new Date(),
      blockNumber: fulfilled!.blockNumber,
      solver: fulfilled!.args.solver as `0x${string}`,
    });

    // Step 4: Poll for PROVEN on Optimism (source)
    const proven = await monitor.pollForProven(
      intentHash,
      'optimism',
      sourceProver as `0x${string}`,
      { interval: 5000, timeout: 180000 }
    );
    expect(proven).not.toBeNull();
    validator.recordState(intentHash, {
      state: 'PROVEN',
      timestamp: new Date(),
      blockNumber: proven!.blockNumber,
    });

    // Step 5: Poll for WITHDRAWN on Optimism (source)
    const withdrawn = await monitor.pollForWithdrawn(
      intentHash,
      'optimism',
      sourcePortal as `0x${string}`,
      { interval: 5000, timeout: 300000 }
    );
    expect(withdrawn).not.toBeNull();
    validator.recordState(intentHash, {
      state: 'WITHDRAWN',
      timestamp: new Date(),
      blockNumber: withdrawn!.blockNumber,
    });

    // Record journey for report
    const journey = validator.getJourney(intentHash);
    reporter.addJourney(journey!);

    expect(journey?.isComplete).toBe(true);
    expect(journey?.currentState).toBe('WITHDRAWN');
  });

  it('should complete Optimism → Arbitrum lifecycle', async () => {
    const intentData = {
      sourceChain: 'optimism' as const,
      destinationChain: 'arbitrum' as const,
      token: 'USDC',
      amount: '1000000',
      reward: '100000',
    };

    // Step 0: Get contract addresses from quote response
    const contracts = await solverClient.getContractAddresses(10, 42161); // Optimism → Arbitrum
    const { sourcePortal, sourceProver, destinationPortal } = contracts;

    // Same flow as above with different destination
    const { intentHash, txHash: publishTx } = await publisher.publish(intentData);
    validator.initializeIntent(intentHash, 'optimism', 'arbitrum');
    validator.recordState(intentHash, {
      state: 'PUBLISHED',
      timestamp: new Date(),
      txHash: publishTx,
    });

    const { txHash: fundTx } = await publisher.fund(intentHash, intentData);
    validator.recordState(intentHash, {
      state: 'FUNDED',
      timestamp: new Date(),
      txHash: fundTx,
    });

    const fulfilled = await monitor.waitForFulfilled(
      intentHash,
      'arbitrum',
      destinationPortal as `0x${string}`,
      { interval: 5000, timeout: 120000 }
    );
    expect(fulfilled).not.toBeNull();
    validator.recordState(intentHash, {
      state: 'FULFILLED',
      timestamp: new Date(),
      blockNumber: fulfilled!.blockNumber,
    });

    const proven = await monitor.pollForProven(
      intentHash,
      'optimism',
      sourceProver as `0x${string}`,
      { interval: 5000, timeout: 180000 }
    );
    expect(proven).not.toBeNull();
    validator.recordState(intentHash, {
      state: 'PROVEN',
      timestamp: new Date(),
      blockNumber: proven!.blockNumber,
    });

    const withdrawn = await monitor.pollForWithdrawn(
      intentHash,
      'optimism',
      sourcePortal as `0x${string}`,
      { interval: 5000, timeout: 300000 }
    );
    expect(withdrawn).not.toBeNull();
    validator.recordState(intentHash, {
      state: 'WITHDRAWN',
      timestamp: new Date(),
      blockNumber: withdrawn!.blockNumber,
    });

    const journey = validator.getJourney(intentHash);
    reporter.addJourney(journey!);

    expect(journey?.isComplete).toBe(true);
  });
});
```

### 4. Parallel Intents Test

**File**: `tests/e2e/parallel-intents.test.ts`

```typescript
import { EventMonitor } from '../../src/services/event-monitor.js';
import { StateValidator } from '../../src/services/state-validator.js';
import { IntentReporter } from '../../src/reporters/intent-reporter.js';
import { IntentPublisher } from '../../src/services/intent-publisher.js';
import type { IntentData, IntentJourney } from '../../src/types/intent.js';
import type { Hash } from 'viem';

const runE2E = process.env.RUN_E2E === 'true';
const describeE2E = runE2E ? describe : describe.skip;

describeE2E('Parallel Intent Execution', () => {
  let publisher: IntentPublisher;
  let monitor: EventMonitor;
  let validator: StateValidator;
  let reporter: IntentReporter;

  beforeAll(() => {
    publisher = new IntentPublisher();
    monitor = new EventMonitor();
    validator = new StateValidator();
    reporter = new IntentReporter();
  });

  afterAll(() => {
    reporter.printSummary();
    reporter.saveReport('./reports');
  });

  jest.setTimeout(600000);

  async function executeLifecycle(intentData: IntentData): Promise<IntentJourney> {
    const { intentHash } = await publisher.publish(intentData);
    validator.initializeIntent(intentHash, intentData.sourceChain, intentData.destinationChain);
    validator.recordState(intentHash, { state: 'PUBLISHED', timestamp: new Date() });

    await publisher.fund(intentHash, intentData);
    validator.recordState(intentHash, { state: 'FUNDED', timestamp: new Date() });

    const fulfilled = await monitor.waitForFulfilled(intentHash, intentData.destinationChain, {
      interval: 5000,
      timeout: 120000,
    });

    if (fulfilled) {
      validator.recordState(intentHash, { state: 'FULFILLED', timestamp: new Date(), blockNumber: fulfilled.blockNumber });

      const proven = await monitor.pollForProven(intentHash, intentData.sourceChain, {
        interval: 5000,
        timeout: 180000,
      });

      if (proven) {
        validator.recordState(intentHash, { state: 'PROVEN', timestamp: new Date(), blockNumber: proven.blockNumber });

        const withdrawn = await monitor.pollForWithdrawn(intentHash, intentData.sourceChain, {
          interval: 5000,
          timeout: 300000,
        });

        if (withdrawn) {
          validator.recordState(intentHash, { state: 'WITHDRAWN', timestamp: new Date(), blockNumber: withdrawn.blockNumber });
        }
      }
    }

    return validator.getJourney(intentHash)!;
  }

  it('should execute multiple intents in parallel', async () => {
    const intents: IntentData[] = [
      { sourceChain: 'optimism', destinationChain: 'base', token: 'USDC', amount: '1000000', reward: '100000' },
      { sourceChain: 'optimism', destinationChain: 'arbitrum', token: 'USDC', amount: '1000000', reward: '100000' },
    ];

    const promises = intents.map((data) => executeLifecycle(data));
    const results = await Promise.allSettled(promises);

    // Add all journeys to reporter
    for (const result of results) {
      if (result.status === 'fulfilled') {
        reporter.addJourney(result.value);
      }
    }

    const succeeded = results.filter(
      (r) => r.status === 'fulfilled' && r.value.currentState === 'WITHDRAWN'
    );

    expect(succeeded.length).toBe(intents.length);
  });
});
```

### 5. Update .env.example

Add routes-cli path:

```bash
# routes-cli path (for subprocess approach)
ROUTES_CLI_PATH=../routes-cli
```

## Directory Structure After Phase 6

```
testereco/
├── src/
│   ├── config/
│   ├── clients/
│   ├── services/
│   │   ├── event-monitor.ts
│   │   ├── state-validator.ts
│   │   └── intent-publisher.ts
│   ├── reporters/
│   ├── types/
│   ├── utils/
│   └── index.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│       ├── intent-lifecycle.test.ts
│       └── parallel-intents.test.ts
├── reports/           # Generated reports (gitignored)
└── ...
```

## Success Criteria

### Automated Verification:
- [ ] `npm run typecheck` passes
- [ ] `npm run test:unit` passes
- [ ] `npm run test:integration` passes (with running solver)

### Manual Verification:
- [ ] Clone routes-cli and verify it works
- [ ] Run E2E tests on testnet: `RUN_E2E=true npm run test:e2e`
- [ ] Verify reports are generated in `/reports`
- [ ] Review timing metrics in reports

## Prerequisites for E2E Tests

1. **Running eco-solver instance**
2. **routes-cli cloned and configured**
3. **Funded wallet** with USDC on Optimism (testnet first!)
4. **Contract addresses** configured in `.env`
5. **Testnet RPC URLs** (Optimism Sepolia, Base Sepolia, Arbitrum Sepolia)

## Running E2E Tests

```bash
# First, ensure all prerequisites are met
# Then run:
RUN_E2E=true npm run test:e2e

# Or specific test:
RUN_E2E=true npm run test:e2e -- intent-lifecycle
```

## Troubleshooting

### Intent not fulfilled
- Verify solver is running and healthy
- Check solver logs for errors
- Ensure reward amount is sufficient

### Proof timeout
- Check HyperProver/bridge status
- Verify prover contract addresses

### routes-cli integration issues
- Check routes-cli README for exact CLI commands
- Verify environment variables are set
- Test routes-cli manually first

---

**Plan Complete!**

After this phase, you'll have a fully functional E2E testing system. Start with testnet configuration, verify everything works, then move to mainnet if needed.
