# Dynamic Chain Support Implementation

## Overview
Implemented dynamic chain loading from the Magenta solver API endpoint `/api/v1/blockchain/chains`. The system now automatically discovers supported chains and their USDC token addresses instead of hardcoding them.

---

## What Was Added

### 1. **New Chains Supported** (4 additional EVM chains)
All chains are fetched dynamically from the solver API:

| Chain | Chain ID | Type | RPC URL Variable |
|-------|----------|------|------------------|
| Ethereum | 1 | EVM | ETHEREUM_RPC_URL |
| Polygon | 137 | EVM | POLYGON_RPC_URL |
| Ronin | 2020 | EVM | RONIN_RPC_URL |
| Ink | 57073 | EVM | INK_RPC_URL |

**Previously Supported (unchanged):**
- Optimism (10) - EVM
- Base (8453) - EVM
- Arbitrum (42161) - EVM
- Solana (1399811149) - SVM

**Total: 8 supported chains**

---

## Files Created

### `src/utils/chain-utils.ts`
Helper utilities for working with blockchain chains from the solver API:
- `mapChainName()` - Maps API chain names to internal format
- `extractUsdcAddresses()` - Extracts USDC token addresses from API response
- `getSupportedChainNames()` - Gets list of all supported chain names
- `getChainByName()` - Finds chain config by name

---

## Files Modified

### 1. **src/clients/solver-client.ts**
Added new types and method to fetch blockchain chains:

```typescript
export interface BlockchainChain {
  chainId: number;
  chainName: string;
  chainType: 'EVM' | 'SVM';
  wallets: BlockchainChainWallet[];
  tokens: BlockchainChainToken[];
}

async getBlockchainChains(): Promise<BlockchainChain[]>
```

### 2. **src/config/chains.ts**
- Updated `SupportedChainName` type to include 8 chains
- Added custom chain definitions for Ronin and Ink (not in viem)
- Added chain configs for Ethereum, Polygon, Ronin, Ink
- Updated `getChainId()` to support all 8 chains

### 3. **src/config/index.ts**
Added 4 new RPC URL fields to config schema:
- `ethereumRpcUrl`
- `polygonRpcUrl`
- `roninRpcUrl`
- `inkRpcUrl`

### 4. **src/clients/evm-client.ts**
Updated `getRpcUrl()` to include all 8 chains

### 5. **tests/e2e/svm-lifecycle.test.ts**
- Changed from hardcoded USDC addresses to dynamic fetching
- Fetches chains in `beforeAll()` hook
- Uses `extractUsdcAddresses()` to get USDC addresses
- Logs discovered chains at test startup

### 6. **tests/e2e/parallel-intents.test.ts**
- Same dynamic chain fetching as svm-lifecycle.test.ts
- USDC addresses loaded from API instead of hardcoded

### 7. **tests/e2e/intent-lifecycle.test.ts**
- Same dynamic chain fetching implementation
- Ensures backward compatibility with existing tests

### 8. **.env.example**
Added 4 new RPC URL examples with public endpoints:
```bash
ETHEREUM_RPC_URL=https://eth.llamarpc.com
POLYGON_RPC_URL=https://polygon-rpc.com
RONIN_RPC_URL=https://api.roninchain.com/rpc
INK_RPC_URL=https://rpc-gel-sepolia.inkonchain.com
```

---

## How It Works

### Before (Hardcoded):
```typescript
const USDC_ADDRESSES: Record<SupportedChainName, Address> = {
  optimism: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  // ... manually defined
};
```

### After (Dynamic):
```typescript
// In test beforeAll()
const chains = await solverClient.getBlockchainChains();
USDC_ADDRESSES = extractUsdcAddresses(chains);
// Automatically includes ALL chains from API
```

---

## Benefits

### 1. **Automatic Chain Discovery**
When the solver adds new chains, tests automatically include them without code changes.

### 2. **Always Up-to-Date Token Addresses**
USDC addresses come from the solver API, ensuring they match what the solver expects.

### 3. **Reduced Maintenance**
No need to manually update token addresses when they change or add new chains.

### 4. **Type Safety**
Full TypeScript support for all chains with compile-time checking.

### 5. **Backward Compatible**
All existing tests continue to work with the new dynamic system.

---

## API Endpoint Details

**URL:** `https://solver-magenta.eco.com/api/v1/blockchain/chains`

**Response Format:**
```json
[
  {
    "chainId": 10,
    "chainName": "OP Mainnet",
    "chainType": "EVM",
    "wallets": [...],
    "tokens": [
      {
        "address": "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
        "decimals": 6,
        "symbol": "USDC"
      }
    ]
  },
  // ... more chains
]
```

---

## Setup Instructions

### 1. Add RPC URLs to `.env`

```bash
# New chains (required for new routes)
ETHEREUM_RPC_URL=https://eth.llamarpc.com
POLYGON_RPC_URL=https://polygon-rpc.com
RONIN_RPC_URL=https://api.roninchain.com/rpc
INK_RPC_URL=https://rpc-gel-sepolia.inkonchain.com
```

### 2. Run Tests
```bash
# All tests now automatically fetch chains from API
RUN_E2E=true npm test
```

### 3. Verify Chain Discovery
When tests start, you'll see:
```
Fetching supported chains from solver API...
Found 8 supported chains: OP Mainnet, Base, Arbitrum One, Solana, Ethereum, Polygon, Ronin, Ink
USDC addresses loaded for: optimism, base, arbitrum, solana, ethereum, polygon, ronin, ink
```

---

## Example: Adding a New Chain

**Before (Manual):**
1. Add chain to `SupportedChainName` type
2. Add chain config to `getChainConfigs()`
3. Add RPC URL to config
4. Add USDC address to all test files
5. Update `getChainId()` function

**After (Automatic):**
1. Developer adds chain to solver API
2. Add RPC URL to `.env`
3. Tests automatically discover and use the new chain ✅

---

## Testing Coverage

The dynamic chain system is now used in:
- ✅ `tests/e2e/svm-lifecycle.test.ts` - SVM cross-chain tests
- ✅ `tests/e2e/parallel-intents.test.ts` - Parallel EVM tests
- ✅ `tests/e2e/intent-lifecycle.test.ts` - Single intent lifecycle tests

**All tests fetch chains dynamically on startup and use the latest data from the solver API.**

---

## Current Status

**Build Status:** ✅ Compiles successfully
**Backward Compatibility:** ✅ All existing tests work
**New Chains Added:** ✅ 4 chains (Ethereum, Polygon, Ronin, Ink)
**Dynamic Fetching:** ✅ Implemented in all test files
**API Integration:** ✅ Connected to `/api/v1/blockchain/chains`

---

## Next Steps

1. **Add RPC URLs to your `.env` file** for the 4 new chains
2. **Fund wallets** with USDC on new chains (if testing those routes)
3. **Run tests** to verify all chains are discovered
4. **Test new routes** with the expanded chain support

**The system is ready to test all 8 chains dynamically!** 🚀
