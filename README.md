# Eco Routes E2E Testing System

End-to-End testing system for the [Eco Routes](https://github.com/eco/eco-routes) protocol. Validates intent lifecycle transitions across EVM chains.

## What is Eco Routes?

Eco Routes is a cross-chain intent protocol that enables token transfers between EVM chains. Users publish **intents** (what they want to happen), and **solvers** compete to fulfill them.

## Intent Lifecycle

Each intent goes through these states:

```
PUBLISHED → FUNDED → FULFILLED → PROVEN → WITHDRAWN
```

| State | Chain | Description |
|-------|-------|-------------|
| `PUBLISHED` | Source | Intent created on-chain |
| `FUNDED` | Source | Tokens locked in vault |
| `FULFILLED` | Destination | Solver executed the transfer |
| `PROVEN` | Source | Proof submitted via HyperProver |
| `WITHDRAWN` | Source | Solver claimed reward |

## Supported Routes

| Source | Destination |
|--------|-------------|
| Optimism | Base |
| Optimism | Arbitrum |

## Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| EVM Interaction | [Viem](https://viem.sh) | Contract calls, event monitoring |
| Test Runner | Jest | Unit, integration, and E2E tests |
| API Testing | Supertest | Solver API validation |
| Logging | Pino | Structured logging |
| Validation | Zod | Environment config validation |
| Retry Logic | p-retry | Resilient RPC calls |

## Project Structure

```
src/
├── config/
│   ├── index.ts          # Environment config (Zod validation)
│   ├── chains.ts         # Chain definitions (OP, Base, Arbitrum)
│   ├── contracts.ts      # Event ABIs
│   └── abis/             # Contract ABIs (Portal, ERC20)
│
├── clients/
│   ├── evm-client.ts     # Viem public/wallet clients
│   └── solver-client.ts  # Solver API client (v2 quotes)
│
├── services/
│   ├── intent-publisher.ts  # Publish & fund intents via Portal.fund()
│   ├── event-monitor.ts     # Poll for Fulfilled/Proven/Withdrawn events
│   └── state-validator.ts   # Track & validate state transitions
│
├── reporters/
│   └── intent-reporter.ts   # Generate JSON reports
│
├── types/
│   └── intent.ts            # TypeScript interfaces
│
└── utils/
    ├── logger.ts            # Pino logger
    └── polling.ts           # Polling utilities

tests/
├── unit/                    # Unit tests
├── integration/             # Solver API & chain connection tests
└── e2e/                     # Full lifecycle tests
    ├── intent-lifecycle.test.ts
    └── parallel-intents.test.ts
```

## Setup

### Prerequisites

- Node.js >= 18.0.0
- Funded wallet with USDC on Optimism

### Installation

```bash
npm install
```

### Configuration

Create a `.env` file:

```env
# Required
PRIVATE_KEY=0x...
SOLVER_URL=https://solver.eco.com

# Optional (defaults to public RPCs)
OPTIMISM_RPC_URL=https://mainnet.optimism.io
BASE_RPC_URL=https://mainnet.base.org
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
```

## Running Tests

```bash
# Type check
npm run typecheck

# Unit tests
npm run test:unit

# Integration tests (requires solver access)
npm run test:integration

# E2E tests (requires funded wallet)
RUN_E2E=true npm run test:e2e
```

## How It Works

### Quote API First

Contract addresses are **never hardcoded**. The workflow:

1. Request quote from Solver API (`POST /api/v2/quote`)
2. Solver returns: fee + contract addresses (Portal, Prover)
3. Use those addresses for on-chain operations

### Publishing an Intent

```typescript
import { IntentPublisher } from 'testereco';

const publisher = new IntentPublisher();
const result = await publisher.publishAndFund({
  sourceChain: 'optimism',
  destinationChain: 'base',
  token: 'USDC',
  amount: '1000000',  // 1 USDC (6 decimals)
  reward: '100000',   // 0.1 USDC
});

console.log(result.intentHash);
```

### Monitoring Events

```typescript
import { EventMonitor } from 'testereco';

const monitor = new EventMonitor();

// Wait for fulfillment on destination chain
const fulfilled = await monitor.waitForFulfilled(
  intentHash,
  'base',
  portalAddress,
  { timeout: 120000 }
);
```

## References

- [Eco Routes Protocol](https://github.com/eco/eco-routes)
- [Eco Solver](https://github.com/eco/eco-solver)
- [Eco Documentation](https://eco.com/docs)

## License

MIT
