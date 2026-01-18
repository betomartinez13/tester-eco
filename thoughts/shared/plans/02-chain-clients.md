# Phase 2: Chain Clients & Configuration

## Overview

Set up Viem clients for all EVM chains and configuration management with Zod validation.

## Changes Required

### 1. Configuration Loader

**File**: `src/config/index.ts`

```typescript
import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

dotenvConfig();

const ConfigSchema = z.object({
  solverUrl: z.string().url(),
  optimismRpcUrl: z.string().url(),
  baseRpcUrl: z.string().url(),
  arbitrumRpcUrl: z.string().url(),
  privateKey: z.string().startsWith('0x').length(66),
  testAmountUsdc: z.string().default('1000000'),
  testRewardUsdc: z.string().default('100000'),
  pollIntervalMs: z.number().default(5000),
  logLevel: z.string().default('info'),
});

export type Config = z.infer<typeof ConfigSchema>;

let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    _config = ConfigSchema.parse({
      solverUrl: process.env.SOLVER_URL,
      optimismRpcUrl: process.env.OPTIMISM_RPC_URL,
      baseRpcUrl: process.env.BASE_RPC_URL,
      arbitrumRpcUrl: process.env.ARBITRUM_RPC_URL,
      privateKey: process.env.PRIVATE_KEY,
      testAmountUsdc: process.env.TEST_AMOUNT_USDC,
      testRewardUsdc: process.env.TEST_REWARD_USDC,
      pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '5000', 10),
      logLevel: process.env.LOG_LEVEL,
    });
  }
  return _config;
}
```

### 2. Chain Configurations

**File**: `src/config/chains.ts`

```typescript
import { optimism, base, arbitrum } from 'viem/chains';
import type { Chain } from 'viem';

export type SupportedChainName = 'optimism' | 'base' | 'arbitrum';

export interface ChainConfig {
  name: SupportedChainName;
  chain: Chain;
  chainId: number;
}

export const CHAIN_CONFIGS: Record<SupportedChainName, ChainConfig> = {
  optimism: { name: 'optimism', chain: optimism, chainId: 10 },
  base: { name: 'base', chain: base, chainId: 8453 },
  arbitrum: { name: 'arbitrum', chain: arbitrum, chainId: 42161 },
};

export const SUPPORTED_ROUTES = [
  { source: 'optimism' as const, destination: 'base' as const },
  { source: 'optimism' as const, destination: 'arbitrum' as const },
];
```

### 3. Contract ABIs (Addresses come from Quote Response)

**File**: `src/config/contracts.ts`

```typescript
import type { Address } from 'viem';

/**
 * Contract addresses are NOT hardcoded.
 * They come dynamically from the solver's quote response.
 * See Phase 3: solver-client.ts for QuoteResponse interface.
 */
export interface ContractAddresses {
  portal: Address;
  prover: Address;
  inbox?: Address;
}

export const PORTAL_ABI = [
  {
    type: 'event',
    name: 'IntentFulfilled',
    inputs: [
      { name: 'intentHash', type: 'bytes32', indexed: true },
      { name: 'solver', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'IntentWithdrawn',
    inputs: [
      { name: 'intentHash', type: 'bytes32', indexed: true },
      { name: 'solver', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const;

export const PROVER_ABI = [
  {
    type: 'event',
    name: 'IntentProven',
    inputs: [
      { name: 'intentHash', type: 'bytes32', indexed: true },
      { name: 'solver', type: 'address', indexed: true },
      { name: 'sourceChain', type: 'uint256', indexed: false },
    ],
  },
] as const;
```

**Note**: Contract addresses are obtained from the solver's quote response (Phase 3), not from environment variables.

### 4. EVM Client

**File**: `src/clients/evm-client.ts`

```typescript
import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type Chain,
  type Transport,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { CHAIN_CONFIGS, type SupportedChainName } from '../config/chains.js';
import { getConfig } from '../config/index.js';

const clientCache = new Map<SupportedChainName, PublicClient<Transport, Chain>>();

function getRpcUrl(chainName: SupportedChainName): string {
  const config = getConfig();
  const urls: Record<SupportedChainName, string> = {
    optimism: config.optimismRpcUrl,
    base: config.baseRpcUrl,
    arbitrum: config.arbitrumRpcUrl,
  };
  return urls[chainName];
}

export function getPublicClient(chainName: SupportedChainName): PublicClient<Transport, Chain> {
  let client = clientCache.get(chainName);
  if (!client) {
    const chainConfig = CHAIN_CONFIGS[chainName];
    client = createPublicClient({
      chain: chainConfig.chain,
      transport: http(getRpcUrl(chainName)),
    });
    clientCache.set(chainName, client);
  }
  return client;
}

export function getWalletClient(chainName: SupportedChainName) {
  const config = getConfig();
  const chainConfig = CHAIN_CONFIGS[chainName];
  const account = privateKeyToAccount(config.privateKey as `0x${string}`);

  return createWalletClient({
    chain: chainConfig.chain,
    transport: http(getRpcUrl(chainName)),
    account,
  });
}

export async function testConnection(chainName: SupportedChainName): Promise<boolean> {
  try {
    const client = getPublicClient(chainName);
    await client.getBlockNumber();
    return true;
  } catch {
    return false;
  }
}
```

### 5. Chain Connection Test

**File**: `tests/integration/chain-connection.test.ts`

```typescript
import { createPublicClient, http } from 'viem';
import { optimism, base, arbitrum } from 'viem/chains';

const chains = [
  { name: 'Optimism', chain: optimism, rpcUrl: process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io' },
  { name: 'Base', chain: base, rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org' },
  { name: 'Arbitrum', chain: arbitrum, rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc' },
];

describe('Chain Connections', () => {
  describe.each(chains)('$name', ({ chain, rpcUrl }) => {
    it('should connect and get block number', async () => {
      const client = createPublicClient({ chain, transport: http(rpcUrl) });
      const blockNumber = await client.getBlockNumber();
      expect(blockNumber).toBeGreaterThan(0n);
    });

    it('should get chain ID', async () => {
      const client = createPublicClient({ chain, transport: http(rpcUrl) });
      const chainId = await client.getChainId();
      expect(chainId).toBe(chain.id);
    });
  });
});
```

## Directory Structure After Phase 2

```
testereco/
├── src/
│   ├── config/
│   │   ├── index.ts
│   │   ├── chains.ts
│   │   └── contracts.ts
│   ├── clients/
│   │   └── evm-client.ts
│   ├── utils/
│   │   └── logger.ts
│   └── index.ts
├── tests/
│   ├── integration/
│   │   └── chain-connection.test.ts
│   └── setup.ts
└── ...
```

## Success Criteria

### Automated Verification:
- [ ] `npm run typecheck` passes
- [ ] `npm run test:integration -- chain-connection` passes (connects to all 3 chains)

### Manual Verification:
- [ ] RPC URLs are working (check logs)
- [ ] Block numbers returned are reasonable

**Next Phase**: Proceed to `03-solver-integration.md` after verification.
