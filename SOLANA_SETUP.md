# Solana Testing Setup Guide

This guide explains how to set up and fund your Solana wallet for testing cross-chain intents.

## Prerequisites

- Node.js 18+ installed
- Existing EVM wallet with PRIVATE_KEY in .env
- Access to fund Solana wallet with SOL and USDC

## Step 1: Generate or Import Solana Wallet

### Option A: Generate New Wallet

If you don't have a Solana wallet, you can generate one using the Solana CLI:

```bash
# Install Solana CLI (macOS/Linux)
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Generate new keypair
solana-keygen new --outfile ~/solana-wallet.json

# Get your public address
solana-keygen pubkey ~/solana-wallet.json

# Get your private key in Base58 format
cat ~/solana-wallet.json
```

### Option B: Use Existing Wallet

If you have a Phantom, Solflare, or other Solana wallet:
1. Export your private key from the wallet
2. Convert to Base58 format if needed

## Step 2: Add to .env

Add your Solana configuration to `.env`:

```bash
# Solana Configuration
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_PRIVATE_KEY=<your-base58-private-key>
```

**Supported private key formats:**
- Base58: `5Jd7F...` (default Solana format)
- JSON array: `[1,2,3,...]` (64 numbers)
- Comma-separated: `1,2,3,...` (64 numbers)

## Step 3: Fund Your Wallet

### Get SOL (for gas fees)

You need approximately **0.1 SOL** (~$15-20 USD) for transaction fees.

**Options:**
1. **Centralized Exchange (CEX):**
   - Buy SOL on Coinbase, Kraken, or Binance
   - Withdraw to your Solana address
   - ⚠️ Make sure to select **Solana network** (not SPL)

2. **Bridge from EVM:**
   - Use Portal Bridge: https://portalbridge.com
   - Bridge ETH or USDC from EVM chains to Solana
   - Convert to SOL on Solana DEX (Jupiter, Raydium)

3. **Ask Dev:**
   - Request SOL from the development team
   - Provide your Solana public address

### Get USDC on Solana

You need **0.2 USDC** ($0.20 USD) for testing 2 routes.

**Options:**
1. **Bridge from EVM:**
   - Use Portal Bridge: https://portalbridge.com
   - Bridge USDC from Optimism/Base/Arbitrum to Solana
   - USDC SPL token address: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

2. **Centralized Exchange:**
   - Withdraw USDC to Solana network
   - ⚠️ Select **Solana (SPL)** network when withdrawing

3. **Swap on Solana:**
   - If you have SOL, swap to USDC on Jupiter: https://jup.ag
   - Connect wallet and swap ~$0.25 SOL to USDC

## Step 4: Verify Balances

Check your balances before testing:

### Check SOL Balance
```bash
solana balance <your-solana-address>
```

### Check USDC Balance (SPL Token)
```bash
spl-token balance EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

### Or use Solana Explorer
Visit: https://explorer.solana.com/address/<your-address>

## Step 5: Run Tests

Once your wallet is funded, run the Solana lifecycle tests:

```bash
# Run Solana lifecycle tests
npm test svm-lifecycle

# Or run all E2E tests (EVM + Solana)
RUN_E2E=true npm test
```

## Test Routes

The test suite covers 2 cross-chain routes:

1. **Solana → Optimism**
   - Transfer 0.1 USDC from Solana to Optimism
   - Uses your Solana wallet as funder
   - Uses your EVM wallet as recipient

2. **Optimism → Solana**
   - Transfer 0.1 USDC from Optimism to Solana
   - Uses your EVM wallet as funder
   - Uses your Solana wallet as recipient

## Expected Costs

- **SOL for gas:** ~0.01 SOL per transaction (~$1.50)
- **USDC transfers:** 0.1 USDC per route ($0.10)
- **Total for 2 routes:** ~0.02 SOL + 0.2 USDC (~$3.20)

## Troubleshooting

### Error: "SOLANA_PRIVATE_KEY not found"
- Make sure you added `SOLANA_PRIVATE_KEY` to your `.env` file
- Verify the format is correct (Base58, JSON array, or comma-separated)

### Error: "Insufficient SOL balance"
- Check your SOL balance: `solana balance <address>`
- Need at least 0.01 SOL for transaction fees
- Fund your wallet with more SOL

### Error: "Failed to get SPL token balance"
- Your wallet might not have a USDC token account yet
- Send some USDC to your wallet to create the account
- Or the Associated Token Account will be created automatically on first transfer

### Quote Request Fails
- Verify solver API is accessible
- Check that Solana chain ID is correct: 1399811149
- Ensure USDC token address is correct

### Transaction Times Out
- Solana can be slower than EVM chains during network congestion
- Default timeout is 2 minutes for fulfillment
- Monitor transaction on Solana Explorer

## Important Notes

⚠️ **Monitoring Limitation:**
The Solana event monitoring currently uses mock results for state tracking because:
- Solana doesn't have event logs like EVM
- Full implementation requires Portal program account state queries
- Publishing and funding work correctly
- EVM side monitoring is fully functional

✅ **What Works:**
- Publishing intents from Solana
- Funding intents on Solana
- Transaction confirmation
- Cross-chain USDC transfers

⚠️ **What's Mocked:**
- IntentFulfilled detection on Solana destination
- IntentProven detection on Solana source
- IntentWithdrawn detection on Solana source

The tests will still pass, but state transitions on Solana side use mock timing (10s delays) rather than real event detection.

## Support

If you encounter issues:
1. Check the logs for detailed error messages
2. Verify your .env configuration
3. Confirm wallet balances on Solana Explorer
4. Ask the development team for assistance

## Resources

- Solana Explorer: https://explorer.solana.com
- Solana CLI Docs: https://docs.solana.com/cli
- Portal Bridge: https://portalbridge.com
- Jupiter Swap: https://jup.ag
- Solana Status: https://status.solana.com
