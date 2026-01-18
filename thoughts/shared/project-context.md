# Eco Routes E2E Testing Project - Context Document

## Project Overview

Build an **E2E Testing System** for the Eco Routes intent-based cross-chain protocol. The system will monitor the complete lifecycle of intents across EVM chains.

**Scope**: EVM chains only (Optimism, Base, Arbitrum). Solana is explicitly out of scope.

---

## What is Eco Routes?

An intent-based protocol for cross-chain operations:
- Users declare **intents** (desired outcomes) instead of executing complex transactions
- **Solvers** execute intents and earn rewards
- **Vaults** hold user funds in escrow until proven execution

### Intent Lifecycle States

```
PUBLISHED → FUNDED → FULFILLED → PROVEN → WITHDRAWN
```

| State | Description | Chain |
|-------|-------------|-------|
| PUBLISHED | Intent created on-chain | Source |
| FUNDED | User deposited tokens + reward into Vault | Source |
| FULFILLED | Solver executed on destination chain | Destination |
| PROVEN | Cross-chain proof verified (20s-2min after fulfilled) | Source |
| WITHDRAWN | Solver claimed reward (2-5min after proven) | Source |

---

## Repositories

### 1. routes-cli (https://github.com/eco/routes-cli)
**Purpose**: Publish and fund intents

Key exports:
- `EvmPublisher` - Create and publish intents
- Intent creation utilities
- Chain configuration

### 2. eco-solver v2 (https://github.com/eco/eco-solver/tree/v2)
**Purpose**: Execute fulfillments and withdrawals

Key components:
- **Portal Contract**: Main entry point, manages intent lifecycle
- **Vault Contract**: Escrow for user funds
- **Executor Contract**: Safe execution on destination chain
- **Prover Contracts**: Bridge proof between chains (HyperProver, LayerZero, etc.)

Events to monitor:
- `IntentPublished` - Intent created
- `IntentFunded` - Funds deposited
- `IntentFulfilled` - Executed on destination
- `IntentProven` - Proof verified on source
- `IntentWithdrawn` - Reward claimed

Test helpers available:
- `waitForApp()` - Poll health endpoint
- `waitForPortalEvent()` - Poll contract logs
- `waitForIntentFulfilled()` - Fulfillment event detection
- `BalanceTracker` - Token balance verification
- `expectIntent()` - Chainable assertions

### 3. eco-routes-svm (EXCLUDED)
Solana programs - not in scope for this project.

---

## Technology Decisions

### Recommended Stack

| Component | Choice | Reasoning |
|-----------|--------|-----------|
| Test Framework | **Jest v29+** | Used by both repos, excellent async support |
| Blockchain Client | **viem v2+** | Used by both repos, modern TypeScript-first |
| Language | **TypeScript** | Strict mode, matches existing codebases |
| Event Monitoring | **viem polling** | More reliable than WebSocket for tests |

### Why NOT Supertest

Supertest is for HTTP API testing. This project tests **blockchain events across multiple chains**, not REST endpoints. The solver runs independently - we don't call HTTP endpoints to trigger fulfillments.

### Why NOT Other Options

| Alternative | Why Not |
|-------------|---------|
| Mocha/Chai | Jest has better async handling, already used by repos |
| Hardhat | Overkill - not deploying/testing contracts |
| Foundry | Rust-based, repos use TypeScript |
| ethers.js | Older API, both repos use viem |

---

## Proposed Architecture

```
eco-routes-e2e/
├── src/
│   ├── core/
│   │   ├── intent-manager.ts      # Create, fund, track intents
│   │   ├── event-listener.ts      # Chain-agnostic event monitoring
│   │   └── state-validator.ts     # Validate state transitions
│   │
│   ├── chains/
│   │   ├── evm-listener.ts        # EVM-specific implementation
│   │   └── chain-config.ts        # RPC URLs, contract addresses
│   │
│   ├── reporters/
│   │   └── test-reporter.ts       # Generate detailed reports
│   │
│   └── types/
│       └── intent.ts              # Intent interfaces
│
├── tests/
│   ├── routes/
│   │   ├── optimism-to-base.test.ts
│   │   └── optimism-to-arbitrum.test.ts
│   │
│   └── helpers/
│       ├── wait-for-event.ts      # Polling utilities
│       └── test-fixtures.ts       # Pre-configured intents
│
├── jest.config.ts
├── package.json
├── tsconfig.json
└── .env
```

---

## Key Implementation Patterns

### 1. Event Polling with Exponential Backoff

```typescript
async function waitForEvent(
  client: PublicClient,
  address: Address,
  abi: Abi,
  eventName: string,
  filter: (log: Log) => boolean,
  timeout: number = 300_000 // 5 minutes
): Promise<Log> {
  const startTime = Date.now();
  let pollInterval = 5_000;

  while (Date.now() - startTime < timeout) {
    const logs = await client.getContractEvents({
      address,
      abi,
      eventName,
      fromBlock: 'earliest',
    });

    const match = logs.find(filter);
    if (match) return match;

    await sleep(pollInterval);
    pollInterval = Math.min(pollInterval * 1.5, 30_000);
  }

  throw new Error(`Timeout waiting for ${eventName}`);
}
```

### 2. Intent State Tracking

```typescript
interface IntentTracker {
  intentHash: string;
  sourceChain: number;
  destinationChain: number;
  states: {
    published?: { timestamp: Date; txHash: string; blockNumber: bigint };
    funded?: { timestamp: Date; txHash: string; blockNumber: bigint };
    fulfilled?: { timestamp: Date; txHash: string; solver: string };
    proven?: { timestamp: Date; txHash: string };
    withdrawn?: { timestamp: Date; txHash: string; amount: bigint };
  };
  timings: {
    publishToFund?: number;
    fundToFulfill?: number;
    fulfillToProven?: number;
    provenToWithdrawn?: number;
    total?: number;
  };
  status: 'pending' | 'funded' | 'fulfilled' | 'proven' | 'withdrawn' | 'failed';
  error?: string;
}
```

### 3. Parallel Intent Testing

```typescript
describe('Parallel Intents', () => {
  jest.setTimeout(600_000); // 10 minutes

  it('should complete multiple intents in parallel', async () => {
    const intents = await Promise.all([
      createAndFundIntent({ source: 'optimism', dest: 'base', amount: 100n }),
      createAndFundIntent({ source: 'optimism', dest: 'base', amount: 200n }),
      createAndFundIntent({ source: 'optimism', dest: 'arbitrum', amount: 150n }),
    ]);

    const results = await Promise.all(
      intents.map(intent => trackIntentLifecycle(intent))
    );

    generateReport(results);
    expect(results.every(r => r.status === 'withdrawn')).toBe(true);
  });
});
```

### 4. Report Generation

```typescript
interface TestReport {
  summary: {
    total: number;
    successful: number;
    failed: number;
    averageTime: number;
  };
  intents: IntentTracker[];
  failures: {
    intentHash: string;
    failedAt: string;
    error: string;
  }[];
}
```

---

## Dependencies

```json
{
  "dependencies": {
    "viem": "^2.21.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0",
    "@types/jest": "^29.5.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0"
  }
}
```

---

## Test Scenarios to Implement

### Basic Routes
1. Optimism → Base (simple transfer)
2. Optimism → Arbitrum (simple transfer)
3. Base → Optimism (reverse direction)

### Parallel Execution
4. Multiple intents same route (3-5 concurrent)
5. Multiple intents different routes (mixed destinations)

### Edge Cases
6. Intent timeout/expiry handling
7. Failed fulfillment detection
8. Proof delay scenarios

### Reporting
9. Per-intent timing breakdown
10. Aggregated success/failure metrics
11. Chain-specific performance analysis

---

## Environment Configuration

Required environment variables:
```bash
# RPC URLs
OPTIMISM_RPC_URL=https://...
BASE_RPC_URL=https://...
ARBITRUM_RPC_URL=https://...

# Contract Addresses
OPTIMISM_PORTAL_ADDRESS=0x...
BASE_PORTAL_ADDRESS=0x...
ARBITRUM_PORTAL_ADDRESS=0x...

# Test Account
PRIVATE_KEY=0x...

# Optional
TEST_TIMEOUT=600000
POLL_INTERVAL=5000
```

---

## Success Criteria

1. **Functional**: Successfully track intents through all states
2. **Parallel**: Handle 5+ concurrent intents without issues
3. **Reliable**: Polling mechanism handles network delays gracefully
4. **Reportable**: Generate clear, actionable test reports
5. **Maintainable**: Clean architecture, easy to add new routes

---

## References

- ECO_ROUTES_GUIDE.md: `/Users/alberto/Downloads/ /ECO_ROUTES_GUIDE.md`
- eco-solver repo: https://github.com/eco/eco-solver/tree/v2
- routes-cli repo: https://github.com/eco/routes-cli
