# ECO Routes E2E Testing System - Implementation Context

## Project Overview

Build an End-to-End testing system for the Eco Routes protocol that validates intent lifecycle transitions across EVM chains.

### Scope
- **In Scope**: EVM chains only (Optimism, Base, Arbitrum)
- **Out of Scope**: Solana (SVM) - explicitly excluded per developer guidance

### Test Routes (EVM Only)
1. **Optimism → Base**
2. **Optimism → Arbitrum**

---

## Technology Stack Decision

### Core Testing Framework
| Component | Technology | Justification |
|-----------|------------|---------------|
| Test Runner | **Jest** | Already used in routes-cli and eco-solver; excellent parallelization; built-in mocking |
| API Testing | **Supertest** | Already configured in eco-solver; perfect for REST endpoint validation |
| EVM Interaction | **Viem** | Modern, TypeScript-first; already used in both source repos |

### Supporting Libraries
| Library | Purpose |
|---------|---------|
| `dotenv` | Environment configuration (RPC URLs, private keys, contract addresses) |
| `pino` | Structured logging for test execution and debugging |
| `p-retry` | Retry logic for flaky blockchain RPC calls |
| `tsx` | TypeScript execution without compilation step |

### Package.json Dependencies
```json
{
  "dependencies": {
    "viem": "^2.x",
    "dotenv": "^16.x",
    "pino": "^8.x",
    "pino-pretty": "^10.x",
    "p-retry": "^6.x"
  },
  "devDependencies": {
    "jest": "^29.x",
    "ts-jest": "^29.x",
    "supertest": "^6.x",
    "@types/jest": "^29.x",
    "@types/supertest": "^2.x",
    "typescript": "^5.x",
    "tsx": "^4.x"
  }
}
```

---

## Source Repositories Reference

### 1. routes-cli (https://github.com/eco/routes-cli)
- **Purpose**: Publish and fund intents
- **Language**: TypeScript
- **Key Libraries**: Viem, Commander.js
- **Usage**: Import as library OR spawn as subprocess to create intents

### 2. eco-solver v2 (https://github.com/eco/eco-solver/tree/v2)
- **Purpose**: Executes fulfillments and withdrawals
- **Language**: TypeScript (NestJS)
- **Key Endpoints**:
  - `GET /health` - Basic health check
  - `GET /health/live` - Liveness probe
  - `GET /health/ready` - Readiness probe
  - `POST /api/v1/quotes` - Quote validation
- **Testing**: Already has Jest + Supertest configured

---

## Architecture Design

### Directory Structure
```
testereco/
├── src/
│   ├── config/
│   │   ├── index.ts              # Main config loader
│   │   ├── chains.ts             # Chain configurations (chainId, RPC, etc.)
│   │   └── contracts.ts          # Contract addresses per chain
│   │
│   ├── clients/
│   │   ├── solver-client.ts      # HTTP client for eco-solver API
│   │   └── evm-client.ts         # Viem public/wallet clients per chain
│   │
│   ├── services/
│   │   ├── intent-publisher.ts   # Creates and funds intents
│   │   ├── event-monitor.ts      # Monitors blockchain events
│   │   └── state-validator.ts    # Validates state transitions
│   │
│   ├── utils/
│   │   ├── polling.ts            # Polling utilities with backoff
│   │   ├── logger.ts             # Pino logger setup
│   │   └── retry.ts              # Retry wrapper for RPC calls
│   │
│   ├── types/
│   │   ├── intent.ts             # Intent data structures
│   │   ├── events.ts             # Event type definitions
│   │   └── config.ts             # Configuration types
│   │
│   └── reporters/
│       └── intent-reporter.ts    # Generates intent journey reports
│
├── tests/
│   ├── setup.ts                  # Jest global setup
│   ├── teardown.ts               # Jest global teardown
│   │
│   ├── unit/
│   │   ├── solver-client.test.ts
│   │   └── event-monitor.test.ts
│   │
│   ├── integration/
│   │   ├── solver-api.test.ts    # Supertest tests for solver endpoints
│   │   └── chain-connection.test.ts
│   │
│   └── e2e/
│       ├── intent-lifecycle.test.ts   # Full lifecycle test
│       ├── optimism-base.test.ts      # Route-specific test
│       └── optimism-arbitrum.test.ts  # Route-specific test
│
├── reports/                      # Generated test reports (gitignored)
├── jest.config.js
├── tsconfig.json
├── package.json
├── .env.example
└── README.md
```

---

## Intent Lifecycle States to Validate

```
PUBLISHED → FUNDED → FULFILLED → PROVEN → WITHDRAWN
```

### State Validation Details

| State | Chain | Contract | Event | Timing |
|-------|-------|----------|-------|--------|
| PUBLISHED | Source | Portal | `IntentPublished` | Immediate |
| FUNDED | Source | Portal/Vault | `IntentFunded` | Immediate |
| FULFILLED | Destination | Portal | `IntentFulfilled` | Variable (solver-dependent) |
| PROVEN | Source | Prover | `IntentProven` | 20s - 2min after Fulfilled |
| WITHDRAWN | Source | Portal | `IntentWithdrawn` | 2-5min after Proven |

---

## Key Implementation Details

### 1. Solver API Testing (Jest + Supertest)

```typescript
// tests/integration/solver-api.test.ts
import request from 'supertest';

const SOLVER_URL = process.env.SOLVER_URL;

describe('Eco Solver API', () => {
  describe('Health Checks', () => {
    it('GET /health returns 200', async () => {
      const res = await request(SOLVER_URL).get('/health').expect(200);
      expect(res.body.status).toBe('ok');
    });

    it('GET /health/ready returns 200 when ready', async () => {
      await request(SOLVER_URL).get('/health/ready').expect(200);
    });
  });

  describe('Quote Validation', () => {
    it('POST /api/v1/quotes returns valid quote', async () => {
      const res = await request(SOLVER_URL)
        .post('/api/v1/quotes')
        .send({
          sourceChainId: 10,      // Optimism
          destinationChainId: 8453, // Base
          inputToken: '0x...USDC',
          outputToken: '0x...USDC',
          inputAmount: '1000000'   // 1 USDC (6 decimals)
        })
        .expect(200);

      expect(res.body).toHaveProperty('isValid');
      expect(res.body).toHaveProperty('fee');
    });
  });
});
```

### 2. EVM Client Setup (Viem)

```typescript
// src/clients/evm-client.ts
import { createPublicClient, createWalletClient, http } from 'viem';
import { optimism, base, arbitrum } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const chains = { optimism, base, arbitrum };

export function createChainClients(chainName: keyof typeof chains) {
  const chain = chains[chainName];
  const rpcUrl = process.env[`${chainName.toUpperCase()}_RPC_URL`];

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    chain,
    transport: http(rpcUrl),
    account: privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`),
  });

  return { publicClient, walletClient };
}
```

### 3. Event Monitoring with Polling

```typescript
// src/services/event-monitor.ts
import { PublicClient, parseAbiItem } from 'viem';

interface PollOptions {
  interval: number;      // ms between polls
  timeout: number;       // max wait time
  startBlock?: bigint;   // block to start from
}

export async function pollForEvent(
  client: PublicClient,
  contractAddress: `0x${string}`,
  eventSignature: string,
  intentHash: `0x${string}`,
  options: PollOptions
): Promise<Log | null> {
  const { interval = 5000, timeout = 180000 } = options;
  const startTime = Date.now();
  let fromBlock = options.startBlock ?? await client.getBlockNumber();

  while (Date.now() - startTime < timeout) {
    const logs = await client.getLogs({
      address: contractAddress,
      event: parseAbiItem(eventSignature),
      args: { intentHash },
      fromBlock,
      toBlock: 'latest',
    });

    if (logs.length > 0) {
      return logs[0];
    }

    // Update fromBlock to avoid re-scanning
    fromBlock = await client.getBlockNumber();
    await sleep(interval);
  }

  return null; // Timeout
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
```

### 4. Intent Lifecycle Test

```typescript
// tests/e2e/intent-lifecycle.test.ts
import { IntentPublisher } from '../../src/services/intent-publisher';
import { EventMonitor } from '../../src/services/event-monitor';
import { StateValidator } from '../../src/services/state-validator';
import { IntentReporter } from '../../src/reporters/intent-reporter';

describe('Intent Lifecycle E2E', () => {
  let publisher: IntentPublisher;
  let monitor: EventMonitor;
  let validator: StateValidator;
  let reporter: IntentReporter;

  beforeAll(async () => {
    publisher = new IntentPublisher();
    monitor = new EventMonitor();
    validator = new StateValidator();
    reporter = new IntentReporter();
  });

  afterAll(async () => {
    await reporter.generateReport();
  });

  // 10 minute timeout for cross-chain operations
  jest.setTimeout(600000);

  it('completes Optimism → Base lifecycle', async () => {
    const intentData = {
      sourceChain: 'optimism',
      destinationChain: 'base',
      token: 'USDC',
      amount: '1000000', // 1 USDC
      reward: '100000',  // 0.1 USDC reward
    };

    // Step 1: Publish intent
    const { intentHash, txHash: publishTx } = await publisher.publish(intentData);
    reporter.recordState(intentHash, 'PUBLISHED', { txHash: publishTx });

    // Step 2: Fund intent
    const { txHash: fundTx } = await publisher.fund(intentHash, intentData);
    reporter.recordState(intentHash, 'FUNDED', { txHash: fundTx });

    // Step 3: Wait for FULFILLED on destination (Base)
    const fulfilledEvent = await monitor.waitForFulfilled(intentHash, 'base', {
      timeout: 120000, // 2 min
    });
    expect(fulfilledEvent).not.toBeNull();
    reporter.recordState(intentHash, 'FULFILLED', {
      solver: fulfilledEvent.args.solver,
      blockNumber: fulfilledEvent.blockNumber,
    });

    // Step 4: Poll for PROVEN on source (Optimism)
    const provenEvent = await monitor.pollForProven(intentHash, 'optimism', {
      interval: 5000,
      timeout: 180000, // 3 min
    });
    expect(provenEvent).not.toBeNull();
    reporter.recordState(intentHash, 'PROVEN', {
      blockNumber: provenEvent.blockNumber,
    });

    // Step 5: Poll for WITHDRAWN on source (Optimism)
    const withdrawnEvent = await monitor.pollForWithdrawn(intentHash, 'optimism', {
      interval: 5000,
      timeout: 300000, // 5 min
    });
    expect(withdrawnEvent).not.toBeNull();
    reporter.recordState(intentHash, 'WITHDRAWN', {
      blockNumber: withdrawnEvent.blockNumber,
    });

    // Validate complete lifecycle
    const validation = validator.validateLifecycle(intentHash);
    expect(validation.isComplete).toBe(true);
  });
});
```

### 5. Jest Configuration

```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  globalTeardown: '<rootDir>/tests/teardown.ts',

  // Parallelization
  maxWorkers: 4,

  // Timeouts
  testTimeout: 600000, // 10 min default for E2E

  // Coverage
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',

  // Test organization
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
      testTimeout: 10000,
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
      testTimeout: 30000,
    },
    {
      displayName: 'e2e',
      testMatch: ['<rootDir>/tests/e2e/**/*.test.ts'],
      testTimeout: 600000,
    },
  ],
};
```

---

## Environment Configuration

### .env.example
```bash
# Solver API
SOLVER_URL=http://localhost:3000

# RPC Endpoints
OPTIMISM_RPC_URL=https://mainnet.optimism.io
BASE_RPC_URL=https://mainnet.base.org
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc

# Wallet (for publishing/funding intents)
PRIVATE_KEY=0x...

# Contract Addresses (mainnet)
OPTIMISM_PORTAL_ADDRESS=0x...
BASE_PORTAL_ADDRESS=0x...
ARBITRUM_PORTAL_ADDRESS=0x...

OPTIMISM_PROVER_ADDRESS=0x...

# Test Configuration
TEST_AMOUNT_USDC=1000000
TEST_REWARD_USDC=100000
POLL_INTERVAL_MS=5000
```

---

## Report Format

### Intent Journey Report (JSON)
```json
{
  "testRun": {
    "id": "run-2026-01-17-abc123",
    "startTime": "2026-01-17T10:00:00Z",
    "endTime": "2026-01-17T10:15:00Z",
    "routes": ["optimism-base", "optimism-arbitrum"]
  },
  "intents": [
    {
      "intentHash": "0xabc...",
      "route": "optimism-base",
      "status": "SUCCESS",
      "states": {
        "published": { "timestamp": "...", "txHash": "0x...", "blockNumber": 123 },
        "funded": { "timestamp": "...", "txHash": "0x...", "blockNumber": 124 },
        "fulfilled": { "timestamp": "...", "solver": "0x...", "blockNumber": 456 },
        "proven": { "timestamp": "...", "blockNumber": 130 },
        "withdrawn": { "timestamp": "...", "blockNumber": 145 }
      },
      "timing": {
        "publishedToFunded": "5s",
        "fundedToFulfilled": "40s",
        "fulfilledToProven": "1m 45s",
        "provenToWithdrawn": "2m 30s",
        "totalDuration": "5m 00s"
      }
    }
  ],
  "summary": {
    "total": 10,
    "succeeded": 9,
    "failed": 1,
    "successRate": "90%"
  }
}
```

---

## Parallelization Strategy

### Running Multiple Intents Simultaneously

```typescript
// tests/e2e/parallel-intents.test.ts
describe('Parallel Intent Execution', () => {
  const routes = [
    { source: 'optimism', dest: 'base' },
    { source: 'optimism', dest: 'arbitrum' },
  ];

  it('executes multiple intents in parallel', async () => {
    const intentPromises = routes.map(async (route) => {
      const intentData = {
        sourceChain: route.source,
        destinationChain: route.dest,
        token: 'USDC',
        amount: '1000000',
      };

      return executeFullLifecycle(intentData);
    });

    const results = await Promise.allSettled(intentPromises);

    // Validate all succeeded
    const succeeded = results.filter(r => r.status === 'fulfilled');
    expect(succeeded.length).toBe(routes.length);
  });
});
```

---

## Error Handling

### Failure Scenarios to Handle

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Intent never fulfilled | Timeout after 2 min | Mark as FAILED, continue other intents |
| Proven event missing | Timeout after 3 min | Mark as STUCK_AT_FULFILLED |
| Withdrawn event missing | Timeout after 5 min | Mark as STUCK_AT_PROVEN |
| RPC connection error | Catch & retry | Use p-retry with exponential backoff |
| Rate limiting | 429 response | Backoff and retry |

---

## NPM Scripts

```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest --selectProjects unit",
    "test:integration": "jest --selectProjects integration",
    "test:e2e": "jest --selectProjects e2e",
    "test:e2e:optimism-base": "jest tests/e2e/optimism-base.test.ts",
    "test:e2e:optimism-arbitrum": "jest tests/e2e/optimism-arbitrum.test.ts",
    "test:coverage": "jest --coverage",
    "lint": "eslint src tests --ext .ts",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## Implementation Priority

### Phase 1: Foundation
1. Project setup (package.json, tsconfig, jest.config)
2. Configuration system (chains, contracts, env)
3. EVM client setup with Viem
4. Basic logging

### Phase 2: Solver Integration
1. Solver HTTP client
2. Health check tests (Supertest)
3. Quote validation tests

### Phase 3: Event Monitoring
1. Event monitor service
2. Polling utilities
3. State validator

### Phase 4: Intent Publishing
1. Intent publisher service (integrate routes-cli)
2. Funding logic

### Phase 5: E2E Tests
1. Single intent lifecycle test
2. Route-specific tests
3. Parallel intent tests

### Phase 6: Reporting
1. Reporter service
2. JSON report generation
3. Console summary output

---

## Key Contract Events (ABI Signatures)

```typescript
// Event signatures for monitoring
export const EVENTS = {
  IntentPublished: 'event IntentPublished(bytes32 indexed intentHash, address indexed creator, bytes data)',
  IntentFunded: 'event IntentFunded(bytes32 indexed intentHash, uint256 amount)',
  IntentFulfilled: 'event IntentFulfilled(bytes32 indexed intentHash, address indexed solver)',
  IntentProven: 'event IntentProven(bytes32 indexed intentHash, address indexed solver, uint256 sourceChain)',
  IntentWithdrawn: 'event IntentWithdrawn(bytes32 indexed intentHash, address indexed solver, uint256 amount)',
};
```

---

## Notes for Plan Creation

1. **Start simple**: Get health checks working first before tackling cross-chain complexity
2. **Use testnets first**: Optimism Sepolia, Base Sepolia, Arbitrum Sepolia for development
3. **Mock where possible**: Unit tests should mock RPC calls; only E2E tests hit real chains
4. **Contract addresses**: Will need to be obtained from eco-routes repository or team
5. **routes-cli integration**: Decide whether to import as library or spawn as subprocess

---

**Document Version**: 1.0
**Created**: 2026-01-17
**Purpose**: Context for implementation plan creation
