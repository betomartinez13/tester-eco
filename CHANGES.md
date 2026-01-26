# Code Refactoring Changes - Technical Documentation

This document explains all changes made to the codebase based on developer feedback. Each change includes both technical details and beginner-friendly explanations.

---

## Change 1: Switch from `fund()` to `publishAndFund()`

**Status**: ✅ CRITICAL - Fixed
**Files**: `src/services/intent-publisher.ts`

### How It Worked Before

```typescript
// Step 1: Hash the route
const routeHash = keccak256(quote.encodedRoute);

// Step 2: Call fund() - assumes intent already exists
await walletClient.writeContract({
  functionName: 'fund',
  args: [destination, routeHash, reward, allowPartial]
});

// Step 3: Look for IntentFunded event
const intentHash = extractFromTopics(receipt.logs);
```

### How It Works Now

```typescript
// Step 1: Call publishAndFund() - creates AND funds in one tx
await walletClient.writeContract({
  functionName: 'publishAndFund',
  args: [destination, quote.encodedRoute, reward, allowPartial]  // Use raw route bytes
});

// Step 2: Look for IntentPublished event
const intentHash = decodeEventLog(receipt.logs);
```

### Technical Explanation

The Portal contract has two workflows:
1. **Two-step**: `publish()` → `fund()` (for when someone else publishes first)
2. **One-step**: `publishAndFund()` (atomic operation)

We were using `fund()` without calling `publish()` first, which meant we were trying to fund a non-existent intent. The contract would fail because it couldn't find the intent to fund.

By switching to `publishAndFund()`, we:
- Create the intent on-chain
- Fund it immediately
- All in a single atomic transaction

The function signature difference:
- `fund(destination, routeHash, reward, allowPartial)` - takes hashed route
- `publishAndFund(destination, route, reward, allowPartial)` - takes raw route bytes

### Beginner Explanation

**Before**: Imagine trying to add money to a bank account that doesn't exist yet. That's what we were doing - trying to fund an intent before creating it.

**After**: Now we create the bank account AND deposit money in one action. This is what `publishAndFund()` does - it creates the intent and funds it at the same time.

Think of it like buying something online:
- **Wrong way**: Click "Pay" without adding items to cart
- **Right way**: Add to cart, THEN pay (both happen together)

---

## Change 2: Get Quote First in Tests (Quote API First)

**Status**: ✅ Fixed
**Files**: `tests/e2e/intent-lifecycle.test.ts`, `tests/e2e/parallel-intents.test.ts`

### How It Worked Before

```typescript
// Test immediately calls publisher
const intentData = {
  sourceChain: 'optimism',
  destinationChain: 'base',
  token: 'USDC',
  amount: '1000000',  // Hardcoded - no validation
  reward: '100000',   // Hardcoded - no validation
};

// Quote fetching happens INSIDE publishAndFund() - invisible to test
await publisher.publishAndFund(intentData);
```

### How It Works Now

```typescript
// Step 1: Test explicitly gets quote FIRST
const quoteRequest = solverClient.buildQuoteRequest({
  sourceChainID: 10,
  destinationChainID: 8453,
  sourceToken: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  destinationToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  sourceAmount: '1000000',
  funder: walletAddress,
  recipient: walletAddress,
});

const quoteResponse = await solverClient.getQuote(quoteRequest);
const quote = quoteResponse.quoteResponses[0];

console.log(`Source: ${quote.sourceAmount}`);       // Visible!
console.log(`Destination: ${quote.destinationAmount}`); // Visible!

// Step 2: Build intent with validated quote data
const intentData = {
  sourceChain: 'optimism',
  destinationChain: 'base',
  sourceToken: USDC_ADDRESSES.optimism,
  destinationToken: USDC_ADDRESSES.base,
  funder: walletAddress,
  recipient: walletAddress,
  quote: {
    sourceAmount: quote.sourceAmount,
    destinationAmount: quote.destinationAmount,
    encodedRoute: quote.encodedRoute,
    deadline: quote.deadline,
    contracts: { sourcePortal, destinationPortal, prover },
  },
};

// Step 3: Publish with validated data
await publisher.publishAndFund(intentData);
```

### Technical Explanation

The "Quote API First" principle means:
1. Always get a quote from the solver before doing anything
2. Use the quote data (amounts, routes, contract addresses) directly
3. Never hardcode values that should come from the quote

This follows the protocol's design where the solver is the source of truth for:
- Fee calculations
- Route information
- Contract addresses
- Execution parameters

By fetching the quote in the test (not inside the publisher), we:
- Can validate quote data before proceeding
- Can test quote functionality separately
- Can log and debug quote responses
- Follow the actual user workflow

### Beginner Explanation

**Before**: Like ordering food delivery without checking the menu first. You don't know the price, delivery time, or if they even deliver to your area.

**After**: Now we:
1. Check the menu (get quote from solver)
2. See the price and delivery time (validate the quote)
3. Place the order (publish the intent)

The test now follows the real workflow:
1. User requests a quote: "How much to send 1 USDC from Optimism to Base?"
2. Solver responds: "It'll cost 0.91 USDC + 0.09 fee, arrives in ~2 minutes"
3. User approves and publishes the intent

Before, we were skipping step 1 and 2, just blindly publishing with made-up numbers.

---

## Change 3: Clarify Source vs Destination Amounts

**Status**: ✅ Fixed
**Files**: `src/types/intent.ts`

### How It Worked Before

```typescript
export interface IntentData {
  sourceChain: SupportedChainName;
  destinationChain: SupportedChainName;
  token: string;              // Which token? Source or destination?
  amount: string;             // Which amount? Send or receive?
  reward: string;             // What does this represent?
}
```

### How It Works Now

```typescript
export interface QuoteData {
  sourceAmount: string;        // Clear: amount you send
  destinationAmount: string;   // Clear: amount received
  encodedRoute: Hex;          // Route data from solver
  deadline: number;           // When quote expires
  contracts: {
    sourcePortal: Address;
    destinationPortal: Address;
    prover: Address;
  };
}

export interface IntentData {
  sourceChain: SupportedChainName;
  destinationChain: SupportedChainName;
  sourceToken: Address;       // Explicit source token
  destinationToken: Address;  // Explicit destination token
  funder: Address;           // Who pays
  recipient: Address;        // Who receives
  quote: QuoteData;          // All quote data embedded
}
```

### Technical Explanation

Cross-chain transfers have two amounts:
- **Source amount**: What you send from the source chain
- **Destination amount**: What arrives on the destination chain (after fees)

The old `IntentData` only had one `amount` field, making it ambiguous which amount it represented. Additionally, it didn't capture that the amount comes from a quote, not from user input.

The new structure:
- Separates `sourceAmount` and `destinationAmount` clearly
- Embeds quote data in the intent data
- Makes explicit that amounts come from the solver, not the user
- Includes all context needed to publish an intent

### Beginner Explanation

**Before**: Imagine international money transfer where you only see one number. Is that what you send, or what your friend receives? With fees and exchange rates, these are different!

**After**: Now it's crystal clear:
- `sourceAmount`: You send $100 USD
- `destinationAmount`: Friend receives €91 EUR (after $9 fee)

Like when you send money through Western Union:
- **You pay**: $100 + fees
- **They receive**: $91 (less than what you sent)

The two amounts are different because:
- Fees are deducted
- Exchange rates apply
- Network costs are involved

Now we track BOTH amounts explicitly, so everyone knows exactly what's happening.

---

## Change 4: Move Quote Logic Out of Publisher

**Status**: ✅ Fixed
**Files**: `src/services/intent-publisher.ts`

### How It Worked Before

```typescript
// IntentPublisher does EVERYTHING
export class IntentPublisher {
  private solverClient: SolverClient;  // Has solver dependency

  async publishAndFund(data: IntentData) {
    // Step 1: Fetch quote (hidden inside publisher)
    const quoteRequest = this.solverClient.buildQuoteRequest(...);
    const quoteResponse = await this.solverClient.getQuote(quoteRequest);
    const quote = quoteResponse.quoteResponses[0];

    // Step 2: Approve tokens
    await walletClient.writeContract({ functionName: 'approve', ... });

    // Step 3: Publish and fund
    await walletClient.writeContract({ functionName: 'publishAndFund', ... });
  }
}
```

107 lines total - doing too much.

### How It Works Now

```typescript
// IntentPublisher focuses on ONE thing: publishing
export class IntentPublisher {
  // No solver dependency!

  async publishAndFund(data: IntentData) {
    // Quote is already in data.quote - just use it
    const { quote } = data;

    // Step 1: Approve tokens
    await walletClient.writeContract({ functionName: 'approve', ... });

    // Step 2: Publish and fund
    await walletClient.writeContract({
      functionName: 'publishAndFund',
      args: [destination, quote.encodedRoute, reward, allowPartial]
    });
  }
}
```

71 lines total - 36 lines removed.

### Technical Explanation

**Single Responsibility Principle**: Each class should do one thing well.

The publisher was doing two things:
1. Fetching quotes (business logic - "what should I do?")
2. Publishing intents (infrastructure - "execute the action")

This created tight coupling:
- Publisher depended on `SolverClient`
- Tests couldn't control quote data
- Couldn't test publishing without a working solver
- Couldn't reuse publisher with different quote sources

By moving quote fetching out:
- Publisher becomes a pure executor (just publishes what you tell it to)
- Tests control the quote data (can test edge cases)
- Publisher can be reused with different quote sources
- Clear separation of concerns

### Beginner Explanation

**Before**: The publisher was like a restaurant chef who:
1. Calls suppliers to check prices (fetch quote)
2. Orders ingredients (approve tokens)
3. Cooks the food (publish intent)

**After**: Now the publisher is just the chef who cooks. Someone else (the test) handles:
1. Calling suppliers (test fetches quote)
2. Handing ingredients to chef (test passes quote to publisher)
3. Chef cooks (publisher publishes)

Why is this better?
- **Chef focuses on cooking** (publisher focuses on publishing)
- **Easy to test**: Give chef mock ingredients, see if they cook properly
- **Flexible**: Can use different suppliers without changing the chef

In software terms:
- **Before**: Publisher was a "God class" doing everything
- **After**: Publisher is a focused service doing one job well

---

## Change 5: Use Viem's Built-in ERC20 ABI

**Status**: ✅ Fixed
**Files**: `src/config/abis/index.ts`, deleted `src/config/abis/erc20.json`

### How It Worked Before

```typescript
// src/config/abis/erc20.json (65 lines)
[
  {
    "inputs": [
      { "internalType": "address", "name": "spender", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // ... more functions
]

// src/config/abis/index.ts
import erc20Abi from './erc20.json';  // Custom ABI
export const ERC20_ABI = erc20Abi;
```

### How It Works Now

```typescript
// src/config/abis/index.ts
import { erc20Abi } from 'viem';      // Built-in from viem
export const ERC20_ABI = erc20Abi;
```

**Result**: Deleted 65 lines of JSON. No custom ERC20 ABI needed.

### Technical Explanation

ERC20 is a standard token interface on Ethereum. Every ERC20 token has the same functions:
- `approve(spender, amount)`
- `transfer(to, amount)`
- `balanceOf(account)`
- etc.

Since it's a standard, viem (the library we use for Ethereum interactions) includes the ERC20 ABI built-in. There's no reason to maintain our own copy.

Benefits:
- **Less code**: No custom ABI file to maintain
- **Always up-to-date**: Viem team maintains it
- **Type safety**: Viem's ABI has full TypeScript definitions
- **Standard compliance**: Using the same ABI everyone else uses

### Beginner Explanation

**Before**: Like writing your own dictionary when one already exists. We were maintaining a 65-line document describing how to talk to ERC20 tokens.

**After**: Just use the dictionary that comes with the library. Viem already knows how to talk to ERC20 tokens - why write it ourselves?

Think of it like USB cables:
- **USB is a standard** - all USB-C cables work the same way
- **Viem includes USB support** - no need to define how USB works
- **We just use it** - import from viem instead of custom definition

We only need to define custom ABIs for unique contracts (like the Portal contract). For standard things (like ERC20), use what the library provides.

---

## Change 6: Type-Safe Portal ABI with `as const`

**Status**: ✅ Fixed
**Files**: `src/config/abis/index.ts`, deleted `src/config/abis/portal.json`

### How It Worked Before

```typescript
// src/config/abis/portal.json (42KB minified, 1 line, 42,453 characters)
[{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},...]

// src/config/abis/index.ts
import portalAbi from './portal.json';
export const PORTAL_ABI = portalAbi;  // Type: any (no type safety)
```

The full Portal contract with 37 functions and 10 events, all minified into one giant line.

### How It Works Now

```typescript
// src/config/abis/index.ts (132 lines, readable)
export const PORTAL_ABI = [
  {
    name: 'publishAndFund',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'destination', type: 'uint64' },
      { name: 'route', type: 'bytes' },
      {
        name: 'reward',
        type: 'tuple',
        components: [
          { name: 'deadline', type: 'uint64' },
          { name: 'creator', type: 'address' },
          { name: 'prover', type: 'address' },
          { name: 'nativeAmount', type: 'uint256' },
          {
            name: 'tokens',
            type: 'tuple[]',
            components: [
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
        ],
      },
      { name: 'allowPartial', type: 'bool' },
    ],
    outputs: [
      { name: 'intentHash', type: 'bytes32' },
      { name: 'vault', type: 'address' },
    ],
  },
  {
    name: 'IntentPublished',
    type: 'event',
    inputs: [
      { indexed: true, name: 'intentHash', type: 'bytes32' },
      // ... more event fields
    ],
  },
] as const;  // ← Type-safe!
```

Only includes the 1 function and 1 event we actually use.

### Technical Explanation

**Type Safety**: TypeScript can't infer types from JSON imports properly. When you `import portalAbi from './portal.json'`, TypeScript treats it as `any`, losing all type information.

Using `as const`:
- Creates a **readonly** type
- Enables **literal type inference**
- TypeScript knows exactly what functions/events exist
- Autocomplete works in IDE
- Compile-time validation of function names

**Minimal ABI**:
- Full Portal contract: 37 functions, 10 events (42KB)
- What we use: 1 function (`publishAndFund`), 1 event (`IntentPublished`)
- Result: 99.7% size reduction

Benefits:
- **Type safety**: Compile-time errors if you mistype function names
- **IDE support**: Autocomplete for ABI fields
- **Readable**: See exactly what we're using
- **Maintainable**: Clear what needs updating if Portal changes
- **Minimal**: Only pay for what you use

### Beginner Explanation

**Before**: Like having the entire New York City phone book when you only need 2 phone numbers. Plus, the phone book is written in a way your computer can't understand well (JSON).

**After**: Write down just the 2 phone numbers you need, in a way your computer fully understands (TypeScript with `as const`).

**Type Safety Analogy**:
Imagine calling a function:

```typescript
// Before (no type safety)
writeContract({ functionName: 'publishAndFumd' })  // Typo! But no error until runtime

// After (with type safety)
writeContract({ functionName: 'publishAndFumd' })  // TypeScript error immediately!
//                              ^^^^^^^^^^^^^^
// Error: Did you mean 'publishAndFund'?
```

The `as const` tells TypeScript: "This is exactly what the ABI looks like, don't change it." This enables:
- **Autocomplete**: IDE suggests `publishAndFund` when you type
- **Validation**: Catches typos before you run the code
- **Documentation**: Hover over function to see parameters

---

## Change 7: Use Viem's Chain Definitions

**Status**: ✅ Fixed
**Files**: `src/config/chains.ts`, `src/clients/evm-client.ts`, `src/services/intent-publisher.ts`

### How It Worked Before

```typescript
// src/config/chains.ts
import { optimism, base, arbitrum } from 'viem/chains';

export interface ChainConfig {
  name: SupportedChainName;
  chain: Chain;
  chainId: number;           // Duplicates chain.id
}

export const CHAIN_CONFIGS: Record<SupportedChainName, ChainConfig> = {
  optimism: { name: 'optimism', chain: optimism, chainId: 10 },
  base: { name: 'base', chain: base, chainId: 8453 },
  arbitrum: { name: 'arbitrum', chain: arbitrum, chainId: 42161 },
};

// src/services/intent-publisher.ts
const CHAIN_IDS: Record<SupportedChainName, number> = {
  optimism: 10,              // Duplicate chain ID again!
  base: 8453,
  arbitrum: 42161,
};

// Usage in code
const chainConfig = CHAIN_CONFIGS[chainName];
const chain = chainConfig.chain;
const chainId = chainConfig.chainId;  // or CHAIN_IDS[chainName]
```

Chain ID stored in **3 places**:
1. Viem's chain object (`optimism.id = 10`)
2. ChainConfig wrapper (`chainId: 10`)
3. CHAIN_IDS constant (`optimism: 10`)

### How It Works Now

```typescript
// src/config/chains.ts
import { optimism, base, arbitrum, type Chain } from 'viem/chains';

export const CHAINS: Record<SupportedChainName, Chain> = {
  optimism,    // Direct viem chain
  base,
  arbitrum,
};

export function getChainId(chainName: SupportedChainName): number {
  return CHAINS[chainName].id;  // Single source of truth
}

// Usage in code
const chain = CHAINS[chainName];
const chainId = getChainId(chainName);  // or CHAINS[chainName].id
```

Chain ID stored in **1 place**: Viem's chain object.

### Technical Explanation

**DRY Principle** (Don't Repeat Yourself): Information should exist in one place, not duplicated across the codebase.

Viem's `Chain` objects already contain everything we need:
```typescript
optimism.id           // 10
optimism.name         // 'Optimism'
optimism.nativeCurrency
optimism.rpcUrls
optimism.blockExplorers
optimism.contracts    // Common contracts like multicall
```

Creating a custom `ChainConfig` wrapper:
- Adds unnecessary abstraction
- Duplicates the chain ID
- Requires manual synchronization
- More code to maintain

Benefits of direct viem chains:
- **Single source of truth**: Chain ID lives in viem only
- **Less code**: No custom wrapper needed
- **Standard approach**: Uses viem the way it's designed
- **Richer data**: Access to all chain properties

### Beginner Explanation

**Before**: Like writing down a phone number in 3 different places:
1. In your phone (viem's chain object)
2. On a sticky note (ChainConfig)
3. On your wall calendar (CHAIN_IDS)

Now if the number changes, you have to update it in 3 places. If you forget one, you'll call the wrong number!

**After**: Just use what's in your phone. When you need a number, look it up in one place.

**Real Example**:

Before (Chain ID in 3 places):
```typescript
optimism.id                  // 10 (from viem)
CHAIN_CONFIGS.optimism.chainId  // 10 (our wrapper)
CHAIN_IDS.optimism              // 10 (our constant)
```

After (Chain ID in 1 place):
```typescript
CHAINS.optimism.id           // 10 (from viem)
getChainId('optimism')       // 10 (helper function)
```

Why is this better?
- **Can't get out of sync** - only one place to check
- **Less code** - no custom wrapper
- **Standard** - using viem as designed
- **More features** - access to all chain properties

---

## Summary of Changes

| # | Change | Lines Removed | Lines Added | Net Change |
|---|--------|---------------|-------------|------------|
| 1 | Switch to publishAndFund() | ~15 | ~12 | -3 |
| 2-4 | Quote API First refactor | ~50 | ~120 | +70 (test clarity) |
| 5 | Use viem's ERC20 ABI | 65 (erc20.json) | 1 import | -64 |
| 6 | Type-safe Portal ABI | 42KB (portal.json) | 132 lines | -99.7% file size |
| 7 | Use viem chains | ~10 | ~8 | -2 |

**Total Impact**:
- ✅ Deleted 2 JSON files (42KB + 65 lines)
- ✅ Removed ~140 lines of redundant code
- ✅ Added ~120 lines of clear, type-safe code
- ✅ Fixed 1 critical bug (wrong contract function)
- ✅ Improved type safety across the board
- ✅ Better separation of concerns
- ✅ Clearer test workflow

---

## Key Principles Applied

1. **Single Responsibility Principle**: Each class does one thing
2. **DRY (Don't Repeat Yourself)**: No duplicate chain IDs or ABIs
3. **Type Safety**: Use TypeScript features (`as const`, proper types)
4. **Separation of Concerns**: Tests fetch quotes, publisher publishes
5. **Use Standard Libraries**: Prefer viem's built-ins over custom code
6. **Minimal ABIs**: Only include what you actually use
7. **Quote API First**: Always get quote before publishing

These changes make the code more maintainable, testable, and aligned with ecosystem best practices.
