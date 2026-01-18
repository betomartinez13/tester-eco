# Phase 1: Project Foundation

## Overview

Set up the project structure with all configuration files, dependencies, and basic utilities.

## Changes Required

### 1. Package Configuration

**File**: `package.json`

```json
{
  "name": "testereco",
  "version": "1.0.0",
  "description": "E2E testing system for Eco Routes protocol",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "test": "NODE_OPTIONS='--experimental-vm-modules' jest",
    "test:unit": "NODE_OPTIONS='--experimental-vm-modules' jest --selectProjects unit",
    "test:integration": "NODE_OPTIONS='--experimental-vm-modules' jest --selectProjects integration",
    "test:e2e": "NODE_OPTIONS='--experimental-vm-modules' jest --selectProjects e2e",
    "test:coverage": "NODE_OPTIONS='--experimental-vm-modules' jest --coverage",
    "lint": "eslint src tests --ext .ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "viem": "^2.21.0",
    "dotenv": "^16.4.5",
    "pino": "^9.5.0",
    "pino-pretty": "^13.0.0",
    "p-retry": "^6.2.1",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.14",
    "@types/node": "^22.10.0",
    "@types/supertest": "^6.0.2",
    "eslint": "^9.16.0",
    "jest": "^29.7.0",
    "prettier": "^3.4.2",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.5",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### 2. TypeScript Configuration

**File**: `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "types": ["node", "jest"]
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 3. Jest Configuration

**File**: `jest.config.js`

```javascript
/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
  maxWorkers: 4,
  testTimeout: 30000,
  verbose: true,
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
      testTimeout: 10000,
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
      testTimeout: 60000,
    },
    {
      displayName: 'e2e',
      testMatch: ['<rootDir>/tests/e2e/**/*.test.ts'],
      testTimeout: 600000,
    },
  ],
};

export default config;
```

### 4. Environment Template

**File**: `.env.example`

```bash
# Solver API (required - contract addresses come from quote response)
SOLVER_URL=http://solver.eco.org  # Get from Eco team

# RPC Endpoints (Mainnet - public, no signup needed)
OPTIMISM_RPC_URL=https://mainnet.optimism.io
BASE_RPC_URL=https://mainnet.base.org
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc

# Wallet (your private key)
PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000000

# Test Config
TEST_AMOUNT_USDC=1000000
TEST_REWARD_USDC=100000
POLL_INTERVAL_MS=5000

# Logging
LOG_LEVEL=info
```

**Note**: Contract addresses (Portal, Prover) are NOT configured here. They are returned dynamically from the solver's quote response.

### 5. Git Ignore

**File**: `.gitignore`

```
node_modules/
dist/
.env
.env.local
coverage/
reports/
*.log
.DS_Store
```

### 6. Logger Utility

**File**: `src/utils/logger.ts`

```typescript
import pino from 'pino';

const isTest = process.env.NODE_ENV === 'test';

export const logger = pino({
  level: isTest ? 'silent' : (process.env.LOG_LEVEL || 'info'),
  transport: isTest ? undefined : {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:standard' },
  },
});

export function createChildLogger(name: string) {
  return logger.child({ module: name });
}
```

### 7. Test Setup

**File**: `tests/setup.ts`

```typescript
import { config } from 'dotenv';
config();

jest.setTimeout(30000);
```

### 8. Main Entry Point

**File**: `src/index.ts`

```typescript
export * from './utils/logger.js';
```

## Directory Structure After Phase 1

```
testereco/
├── src/
│   ├── utils/
│   │   └── logger.ts
│   └── index.ts
├── tests/
│   └── setup.ts
├── package.json
├── tsconfig.json
├── jest.config.js
├── .env.example
├── .gitignore
└── IMPLEMENTATION_CONTEXT.md
```

## Success Criteria

### Automated Verification:
- [ ] `npm install` completes without errors
- [ ] `npm run typecheck` passes
- [ ] `npm run test` runs (even with no tests yet)

### Manual Verification:
- [ ] Project structure matches the design
- [ ] All configuration files are in place

**Next Phase**: Proceed to `02-chain-clients.md` after verification.
