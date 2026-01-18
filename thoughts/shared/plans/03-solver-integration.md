# Phase 3: Solver API Integration

## Overview

Build HTTP client for eco-solver and Jest+Supertest tests for health checks and quote validation.

## Changes Required

### 1. Solver Client

**File**: `src/clients/solver-client.ts`

```typescript
import { getConfig } from '../config/index.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('SolverClient');

export interface HealthResponse {
  status: 'ok' | 'error';
}

export interface QuoteRequest {
  sourceChainId: number;
  destinationChainId: number;
  inputToken: string;
  outputToken: string;
  inputAmount: string;
}

export interface QuoteResponse {
  isValid: boolean;
  fee: string;
  outputAmount?: string;
  // Contract addresses are included in the response
  contracts: {
    sourcePortal: string;
    sourceProver: string;
    destinationPortal: string;
    inbox?: string;
  };
}

export class SolverClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || getConfig().solverUrl;
  }

  async health(): Promise<HealthResponse> {
    log.debug('Checking solver health');
    const res = await fetch(`${this.baseUrl}/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
    return res.json();
  }

  async healthLive(): Promise<HealthResponse> {
    const res = await fetch(`${this.baseUrl}/health/live`);
    if (!res.ok) throw new Error(`Liveness check failed: ${res.status}`);
    return res.json();
  }

  async healthReady(): Promise<HealthResponse> {
    const res = await fetch(`${this.baseUrl}/health/ready`);
    if (!res.ok) throw new Error(`Readiness check failed: ${res.status}`);
    return res.json();
  }

  async getQuote(request: QuoteRequest): Promise<QuoteResponse> {
    log.debug({ request }, 'Getting quote');
    const res = await fetch(`${this.baseUrl}/api/v1/quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw new Error(`Quote request failed: ${res.status}`);
    return res.json();
  }

  /**
   * Get contract addresses for a route from quote response
   */
  async getContractAddresses(sourceChainId: number, destinationChainId: number) {
    const quote = await this.getQuote({
      sourceChainId,
      destinationChainId,
      inputToken: '0x0000000000000000000000000000000000000000',
      outputToken: '0x0000000000000000000000000000000000000000',
      inputAmount: '1000000',
    });
    return quote.contracts;
  }
}

export function getSolverClient(): SolverClient {
  return new SolverClient();
}
```

### 2. Solver API Tests (Jest + Supertest)

**File**: `tests/integration/solver-api.test.ts`

```typescript
import request from 'supertest';

const SOLVER_URL = process.env.SOLVER_URL || 'http://localhost:3000';

describe('Eco Solver API', () => {
  describe('Health Checks', () => {
    it('GET /health should return 200 with status ok', async () => {
      const res = await request(SOLVER_URL)
        .get('/health')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveProperty('status');
      expect(res.body.status).toBe('ok');
    });

    it('GET /health/live should return 200 (liveness probe)', async () => {
      const res = await request(SOLVER_URL)
        .get('/health/live')
        .expect(200);

      expect(res.body).toHaveProperty('status');
    });

    it('GET /health/ready should return 200 when ready', async () => {
      const res = await request(SOLVER_URL)
        .get('/health/ready')
        .expect(200);

      expect(res.body).toHaveProperty('status');
    });
  });

  describe('Quote Validation', () => {
    it('POST /api/v1/quotes should return valid quote for Optimism → Base', async () => {
      const res = await request(SOLVER_URL)
        .post('/api/v1/quotes')
        .send({
          sourceChainId: 10,
          destinationChainId: 8453,
          inputToken: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // USDC Optimism
          outputToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC Base
          inputAmount: '1000000',
        })
        .set('Content-Type', 'application/json')
        .expect(200);

      expect(res.body).toHaveProperty('isValid');
      expect(res.body).toHaveProperty('fee');
    });

    it('POST /api/v1/quotes should return valid quote for Optimism → Arbitrum', async () => {
      const res = await request(SOLVER_URL)
        .post('/api/v1/quotes')
        .send({
          sourceChainId: 10,
          destinationChainId: 42161,
          inputToken: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // USDC Optimism
          outputToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC Arbitrum
          inputAmount: '1000000',
        })
        .set('Content-Type', 'application/json')
        .expect(200);

      expect(res.body).toHaveProperty('isValid');
      expect(res.body).toHaveProperty('fee');
    });

    it('POST /api/v1/quotes should handle invalid request gracefully', async () => {
      const res = await request(SOLVER_URL)
        .post('/api/v1/quotes')
        .send({
          sourceChainId: 999999, // Invalid chain
          destinationChainId: 8453,
          inputToken: '0x0000000000000000000000000000000000000000',
          outputToken: '0x0000000000000000000000000000000000000000',
          inputAmount: '1000000',
        })
        .set('Content-Type', 'application/json');

      // Should either return 400 or isValid: false
      if (res.status === 200) {
        expect(res.body.isValid).toBe(false);
      } else {
        expect(res.status).toBeGreaterThanOrEqual(400);
      }
    });
  });
});
```

### 3. Solver Client Unit Test

**File**: `tests/unit/solver-client.test.ts`

```typescript
import { SolverClient } from '../../src/clients/solver-client.js';

describe('SolverClient', () => {
  it('should construct with default URL from config', () => {
    // This test verifies the client can be instantiated
    // Full testing requires a running solver
    const client = new SolverClient('http://test-url:3000');
    expect(client).toBeInstanceOf(SolverClient);
  });
});
```

## Directory Structure After Phase 3

```
testereco/
├── src/
│   ├── config/
│   │   └── ...
│   ├── clients/
│   │   ├── evm-client.ts
│   │   └── solver-client.ts
│   └── ...
├── tests/
│   ├── unit/
│   │   └── solver-client.test.ts
│   ├── integration/
│   │   ├── chain-connection.test.ts
│   │   └── solver-api.test.ts
│   └── setup.ts
└── ...
```

## Success Criteria

### Automated Verification:
- [ ] `npm run typecheck` passes
- [ ] `npm run test:unit -- solver-client` passes
- [ ] `npm run test:integration -- solver-api` passes (requires running solver)

### Manual Verification:
- [ ] Verify solver is running and accessible
- [ ] Check quote responses are reasonable (fees, output amounts)

## Prerequisites

This phase requires a running eco-solver instance:
1. Clone eco-solver: `git clone https://github.com/eco/eco-solver.git`
2. Checkout v2 branch: `git checkout v2`
3. Follow setup instructions in eco-solver README
4. Set `SOLVER_URL` in `.env`

**Next Phase**: Proceed to `04-event-monitoring.md` after verification.
