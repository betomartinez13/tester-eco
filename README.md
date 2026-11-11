# Eco Routes E2E Testing System

End-to-End testing system for the [Eco Routes](https://github.com/eco/eco-routes) protocol. Sends real (cents of) USDC through the protocol across EVM chains and Solana, and validates every intent lifecycle transition on-chain.

> **Solo project** · TypeScript
> It evolved into [`eco-circuit-breaker`](https://github.com/betomartinez13/eco-circuit-breaker), a joint project that continuously validates every route on a schedule (this repo includes the first circuit-breaker prototype in `tests/circuit-breaker/`).

> ⚠️ **This system spends real money.** E2E tests and the circuit breaker send real transactions on mainnet. Use a dedicated test wallet with a small balance, and never commit your `.env`.

## What is Eco Routes?

Eco Routes is a cross-chain intent protocol that enables token transfers between EVM chains and Solana. Users publish **intents** (what they want to happen), and **solvers** compete to fulfill them.

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

On EVM, `PUBLISHED` and `FUNDED` happen in one transaction (`publishAndFund`). On Solana, the intent state is detected through program-derived accounts instead of events.

## Supported Routes

28 directional routes completed the full lifecycle with real funds:

| Source | Destinations |
|--------|--------------|
| Optimism | Base, Arbitrum |
| Base | Optimism, Arbitrum, Polygon, Ethereum, Ronin, Solana |
| Arbitrum | Optimism, Base, Polygon, Ethereum, Solana |
| Ethereum | Optimism, Base, Polygon, Ronin, Solana |
| Polygon | Optimism, Base, Arbitrum, Ethereum, Solana |
| Solana | Optimism, Base, Arbitrum, Polygon, Ethereum |

Chain list and USDC addresses are discovered dynamically from the solver API, and the `all-routes` test generates every source → destination pair from that data. Ink is configured but was not supported by the solver in production at the time.

## Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| EVM Interaction | [Viem](https://viem.sh) | Contract calls, event monitoring |
| Solana Interaction | `@solana/web3.js`, `@coral-xyz/anchor`, `@solana/spl-token` | Anchor transactions, PDA derivation, token accounts |
| Encoding | `bn.js`, `bs58`, Borsh (via Anchor coder) | Solana amounts, keys and intent hashing |
| Test Runner | Jest + ts-jest (ESM) | Unit, integration, E2E and circuit-breaker tests |
| API Testing | Supertest | Solver API validation |
| Logging | Pino | Structured logging |
| Validation | Zod | Environment and circuit-breaker config/report validation |
| Retry & Concurrency | p-retry, p-map | Resilient RPC calls, controlled concurrency |
| CI | GitHub Actions | Scheduled circuit-breaker runs |

## Results

From the framework's own JSON reports and `TEST_TRACKING.md`:

| | |
|---|---|
| Real intents recorded | 56, of which **54 completed the full lifecycle** (96%) |
| Distinct routes | 28, across 7 chains (Optimism, Base, Arbitrum, Ethereum, Polygon, Ronin, Solana) |
| Full-lifecycle time | EVM ↔ EVM 44–178 s · Solana → EVM 75–257 s |
| Circuit-breaker prototype | 20 routes across 5 chains; best full run 18/20; 19 of 20 routes verified across individual runs |

## Key Technical Decisions

- **Chain-specific intent hash.** The intent hash is computed locally before sending Solana transactions (it seeds the vault account). The reward hash uses packed/ABI encoding for EVM sources and Borsh for Solana; the wrong encoding is rejected by the Portal.
- **Solana state without events.** Solana has no event logs, so the monitor derives the `fulfill_marker` and `proof` accounts from the intent hash and polls them.
- **Explicit nonces.** Public RPC nodes behind load balancers return stale nonces, so EVM nonces are tracked locally (a parallel run of six routes from one wallet exposed this).
- **Rate-limited chains.** On Ethereum, Polygon and Ronin the monitor keeps a block cursor and queries only new blocks instead of rescanning a fixed window.
- **Balance verification.** Wallet balances are snapshotted before funding and after funding, fulfillment and withdrawal, to prove money actually moved.

## Project Structure

```
src/
├── config/
│   ├── index.ts          # Environment config (Zod validation)
│   ├── chains.ts         # Chain definitions (8 chains, EVM + Solana)
│   ├── contracts.ts      # Event ABIs
│   ├── portal.idl.ts     # Solana Portal program IDL
│   └── abis/             # Contract ABIs (Portal, ERC20)
│
├── clients/
│   ├── evm-client.ts     # Viem public/wallet clients
│   ├── svm-client.ts     # Solana connection and keypair parsing
│   └── solver-client.ts  # Solver API client (v2 quotes, chains, health)
│
├── publishers/
│   ├── base-publisher.ts    # Common publisher interface
│   ├── evm-publisher.ts     # Portal.publishAndFund() on EVM chains
│   ├── svm-publisher.ts     # Anchor fund() on Solana
│   └── publisher-factory.ts # Picks the publisher by chain type
│
├── services/
│   ├── intent-publisher.ts  # Publish & fund intents (delegates to publisher)
│   ├── event-monitor.ts     # Poll Fulfilled/Proven/Withdrawn events (EVM)
│   ├── svm-event-monitor.ts # Poll Solana program-derived accounts
│   └── state-validator.ts   # Track & validate state transitions
│
├── reporters/
│   └── intent-reporter.ts   # Generate JSON reports
│
├── types/                   # Intent, chain and universal-address types
│
└── utils/
    ├── portal-hash.ts       # Intent hash (ABI vs Borsh encoding)
    ├── address-normalizer.ts# EVM ↔ Solana address normalization
    ├── balance-tracker.ts   # Balance snapshots through the lifecycle
    ├── logger.ts            # Pino logger
    └── polling.ts           # Polling utilities

tests/
├── unit/                    # Unit tests
├── integration/             # Solver API & chain connection tests
├── e2e/                     # Full lifecycle tests
│   ├── intent-lifecycle.test.ts
│   ├── parallel-intents.test.ts
│   ├── svm-lifecycle.test.ts
│   └── all-routes.test.ts   # Every route, generated from solver chain data
└── circuit-breaker/         # Circuit-breaker prototype (20 routes, 5 phases)
```

## Setup

### Prerequisites

- Node.js >= 18.0.0
- Funded wallet with USDC and gas on the chains you test
- A funded Solana wallet (USDC and SOL) for Solana routes

### Installation

```bash
npm install
```

### Configuration

Copy the template and fill in your keys:

```bash
cp .env.example .env
```

```env
# Required
PRIVATE_KEY=0x...
SOLVER_URL=https://solver.eco.com

# Required for Solana routes (Base58, JSON array or comma-separated)
SOLANA_PRIVATE_KEY=...

# Optional (defaults to public RPCs)
OPTIMISM_RPC_URL=https://mainnet.optimism.io
BASE_RPC_URL=https://mainnet.base.org
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
```

Circuit-breaker variables use the `CB_` prefix and are documented in `.env.example`.

## Running Tests

```bash
# Type check
npm run typecheck

# Unit tests
npm run test:unit

# Integration tests (requires solver access)
npm run test:integration

# E2E tests (requires funded wallet; spends real funds)
RUN_E2E=true npm run test:e2e

# Circuit-breaker prototype (20 routes; spends real funds)
npm run test:circuit-breaker
```

Run E2E suites with `--runInBand` if public RPCs start rate-limiting.

## How It Works

### Quote API First

Contract addresses are **never hardcoded**. The workflow:

1. Request quote from Solver API (`POST /api/v2/quote/reverse`)
2. Solver returns: fee, encoded route, deadline + contract addresses (source Portal, destination Portal, Prover)
3. Use those addresses for on-chain operations

### Publishing an Intent

```typescript
import { SolverClient, IntentPublisher, isQuoteSuccess } from 'testereco';

const solver = new SolverClient();
const quoteResponse = await solver.getQuote(
  solver.buildQuoteRequest({
    sourceChainID: 10,            // Optimism
    destinationChainID: 8453,     // Base
    sourceToken: usdcOptimism,
    destinationToken: usdcBase,
    sourceAmount: '100000',       // 0.1 USDC (6 decimals)
    funder: walletAddress,
    recipient: walletAddress,
  })
);
if (!isQuoteSuccess(quoteResponse)) throw new Error('Quote failed');

const q = quoteResponse.quoteResponses[0];
const publisher = new IntentPublisher();   // picks EVM or Solana publisher by source chain
const { intentHash, sourcePortal, destinationPortal, prover } =
  await publisher.publishAndFund({
    sourceChain: 'optimism',
    destinationChain: 'base',
    sourceToken: usdcOptimism,
    destinationToken: usdcBase,
    funder: walletAddress,
    recipient: walletAddress,
    quote: {
      sourceAmount: q.sourceAmount,
      destinationAmount: q.destinationAmount,
      encodedRoute: q.encodedRoute,
      deadline: q.deadline,
      contracts: quoteResponse.contracts,
    },
  });
```

### Monitoring Events

```typescript
import { EventMonitor } from 'testereco';

const monitor = new EventMonitor();

// Wait for fulfillment on the destination chain
const fulfilled = await monitor.waitForFulfilled(
  intentHash,
  'base',
  destinationPortal,
  { interval: 5000, timeout: 120000 }
);

// Then proof on the source chain, then withdrawal
const proven = await monitor.pollForProven(/* ... */);
const withdrawn = await monitor.pollForWithdrawn(/* ... */);
```

For Solana, `EventMonitor` delegates to `SvmEventMonitor`, which polls program-derived accounts instead of event logs.

## Circuit Breaker Prototype

`tests/circuit-breaker/` is a scheduled, self-contained route validator built from a written spec: discovery → publish → fulfillment → proving → JSON report + optional webhook alert, over 20 routes across Optimism, Base, Arbitrum, Polygon and Solana. A route passes when it is proven. It runs on GitHub Actions every 30 minutes (`.github/workflows/circuit-breaker.yml`, non-overlapping runs) and imports only four modules from `src/`.

The production version, built jointly with a second engineer, is [`eco-circuit-breaker`](https://github.com/betomartinez13/eco-circuit-breaker).

## Tracking and Notes

- `TEST_TRACKING.md`: session-by-session log of real routes (balances, fees, timings, issues found).
- `DYNAMIC_CHAINS.md`: how chains and tokens are discovered from the solver.
- `SOLANA_SETUP.md`: Solana configuration.
- `docs/CHANGES.md`: notes on an early refactor.

## References

- [Eco Routes Protocol](https://github.com/eco/eco-routes)
- [Eco Solver](https://github.com/eco/eco-solver)
- [Eco Documentation](https://eco.com/docs)

## License

MIT
