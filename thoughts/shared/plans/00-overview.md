# ECO Routes E2E Testing System - Implementation Plan

## Overview

Build an End-to-End testing system for the Eco Routes protocol that validates intent lifecycle transitions across EVM chains.

## Scope

- **In Scope**: EVM chains only (Optimism, Base, Arbitrum)
- **Out of Scope**: Solana (SVM) - explicitly excluded

## Routes to Test

1. Optimism → Base
2. Optimism → Arbitrum

## Lifecycle to Validate

```
PUBLISHED → FUNDED → FULFILLED → PROVEN → WITHDRAWN
```

## Technology Stack

| Component | Technology |
|-----------|------------|
| Test Runner | Jest |
| API Testing | Supertest |
| EVM Interaction | Viem |
| Intent Publishing | routes-cli |
| Logging | Pino |

## Implementation Phases

| Phase | File | Focus |
|-------|------|-------|
| 1 | `01-project-foundation.md` | Project setup, dependencies, configuration files |
| 2 | `02-chain-clients.md` | Viem clients, chain config, contract addresses |
| 3 | `03-solver-integration.md` | Solver HTTP client, health/quote tests |
| 4 | `04-event-monitoring.md` | Polling utilities, event monitor service |
| 5 | `05-state-reporting.md` | State validator, JSON report generator |
| 6 | `06-e2e-tests.md` | Intent publishing, full lifecycle tests |

## What We're NOT Doing

- Solana support
- Running our own solver
- Testing edge cases or attack scenarios
- UI/frontend
- Modifying the Eco Routes protocol

## References

- Implementation Context: `IMPLEMENTATION_CONTEXT.md`
- routes-cli: https://github.com/eco/routes-cli
- eco-solver: https://github.com/eco/eco-solver/tree/v2
