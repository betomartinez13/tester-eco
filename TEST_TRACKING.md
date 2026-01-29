# EVM Cross-Chain Test Tracking

## Test Session: January 29, 2026

### Initial Balances (Before Any Tests)
| Chain | USDC | Native Token | Total Value |
|-------|------|--------------|-------------|
| Optimism | 0.26 USDC | 0.000620 ETH ($1.76) | $2.02 |
| Base | 2.15 USDC | 0.00110 ETH ($3.07) | $5.22 |
| Arbitrum | 1.13 USDC | 0.000620 ETH ($1.74) | $2.87 |
| **TOTAL** | **3.54 USDC** | **~$6.57 in ETH** | **$10.11** |

---

## Test Results

| # | From Chain | To Chain | Amount Sent | Amount Received | Gas (Currency) | Start Balance | End Balance | Time | Status | Notes |
|---|------------|----------|-------------|-----------------|----------------|---------------|-------------|------|--------|-------|
| 1 | Optimism | Base | 0.1 USDC | 0.07995 USDC | ~0.0001 ETH | Opt: 0.26 USDC / Base: 2.15 USDC | Opt: ~0.16 USDC / Base: ~2.23 USDC | 84.8s | ✅ SUCCESS | Fee: 20% (0.02 USDC) |
| 2 | Optimism | Arbitrum | 0.1 USDC | 0.07995 USDC | ~0.0001 ETH | Opt: ~0.16 USDC / Arb: 1.13 USDC | Opt: ~0.06 USDC / Arb: ~1.21 USDC | 76.0s | ✅ SUCCESS | Fee: 20% (0.02 USDC) |
| 3 | Base | Optimism | 0.1 USDC | - | $0.00 | Base: 2.15 USDC / Opt: ~0.06 USDC | Base: 2.15 USDC / Opt: ~0.06 USDC | 0s | ❌ NONCE ERROR | Failed before sending tx |
| 4 | - | - | - | - | - | - | - | - | ⏳ Pending | Route 4: Base → Arbitrum |
| 5 | - | - | - | - | - | - | - | - | ⏳ Pending | Route 5: Arbitrum → Optimism |
| 6 | - | - | - | - | - | - | - | - | ⏳ Pending | Route 6: Arbitrum → Base |

---

## Detailed Test Logs

### Test #1: Optimism → Base
**Status:** ✅ SUCCESS

**Pre-Test:**
- Optimism Balance: 0.26 USDC + 0.000620 ETH
- Base Balance: 2.15 USDC + 0.00110 ETH

**Transaction:**
- Intent Hash: `0x5236fc315cd4022e2b99820c0159ce2b6dbb4a6f34177a002c8cc75601472bda`
- Tx Hash (Fund): `0x65b1d409e721db19c1cc9ffd8a04234c38f7138e5978b39e9f5402c01a3fab14`
- Amount Sent: 0.1 USDC
- Amount Received: 0.07995 USDC
- Fee: 0.020050 USDC (20%)
- Gas Fee: ~0.0001 ETH (~$0.28)
- Timestamp: Jan 29, 2026 21:15:10 UTC

**Timing:**
- FUNDED → FULFILLED: 17.3s
- FULFILLED → PROVEN: 33.9s
- PROVEN → WITHDRAWN: 33.6s
- **Total: 84.8s (~1.4 minutes)**

**Blockchain Details:**
- Fulfilled Block (Base): 41465990
- Proven Block (Optimism): 147061291
- Withdrawn Block (Optimism): 147061307

**Post-Test:**
- Optimism Balance: ~0.16 USDC + ~0.000520 ETH
- Base Balance: ~2.23 USDC + 0.00110 ETH

**Explorer Links:**
- Optimism Tx: https://optimistic.etherscan.io/tx/0x65b1d409e721db19c1cc9ffd8a04234c38f7138e5978b39e9f5402c01a3fab14
- Base Fulfill: https://basescan.org/block/41465990

---

### Test #2: Optimism → Arbitrum
**Status:** ✅ SUCCESS

**Pre-Test:**
- Optimism Balance: ~0.16 USDC + ~0.000520 ETH (after Test #1)
- Arbitrum Balance: 1.13 USDC + 0.000620 ETH

**Transaction:**
- Intent Hash: `0x0b000063728645ac84f2414be84729921c32b631dfb34ae06ffa50ef1194d015`
- Tx Hash (Fund): `0x77583acfd8352c3c5eec384564e0f734c26f6197aaa0df0631c2dad905d48ff6`
- Amount Sent: 0.1 USDC
- Amount Received: 0.07995 USDC
- Fee: 0.020050 USDC (20%)
- Gas Fee: ~0.0001 ETH (~$0.28)
- Timestamp: Jan 29, 2026 22:38:47 UTC

**Timing:**
- FUNDED → FULFILLED: 21.6s
- FULFILLED → PROVEN: 11.2s
- PROVEN → WITHDRAWN: 43.2s
- **Total: 76.0s (~1.3 minutes)**

**Blockchain Details:**
- Fulfilled Block (Arbitrum): 426601393
- Proven Block (Optimism): 147063789
- Withdrawn Block (Optimism): 147063812

**Post-Test:**
- Optimism Balance: ~0.06 USDC + ~0.000420 ETH
- Arbitrum Balance: ~1.21 USDC + 0.000620 ETH

**Explorer Links:**
- Optimism Tx: https://optimistic.etherscan.io/tx/0x77583acfd8352c3c5eec384564e0f734c26f6197aaa0df0631c2dad905d48ff6
- Arbitrum Fulfill: https://arbiscan.io/block/426601393

---

### Test #3: Base → Optimism
**Status:** ❌ NONCE ERROR

**Pre-Test:**
- Base Balance: 2.15 USDC + 0.00110 ETH
- Optimism Balance: ~0.06 USDC + ~0.000420 ETH (after Test #2)

**Transaction:**
- Intent Hash: N/A
- Tx Hash: N/A
- Amount Sent: 0.1 USDC (attempted)
- Gas Fee: $0.00 (transaction not sent)
- Timestamp: Jan 29, 2026 22:42 UTC

**Error:**
```
NonceTooLowError: Nonce provided for the transaction is lower than the current nonce of the account.
Details: nonce too low: next nonce 4, tx nonce 3
```

**Root Cause:**
Viem wallet client on Base chain has stale nonce. The client tried to use nonce 3, but the account's current nonce on Base is already 4. This happens when:
1. Multiple transactions sent quickly without waiting for confirmation
2. Nonce cache not refreshed between transactions
3. Base RPC node has different nonce than wallet client cached

**Post-Test:**
- Base Balance: 2.15 USDC + 0.00110 ETH (unchanged)
- Optimism Balance: ~0.06 USDC + ~0.000420 ETH (unchanged)

**Note:** This is a known issue mentioned in the plan. Need to fix nonce management in evm-publisher.ts

---

### Test #4: Base → Arbitrum
**Status:** ⏳ Not started

---

### Test #5: Arbitrum → Optimism
**Status:** ⏳ Not started

---

### Test #6: Arbitrum → Base
**Status:** ⏳ Not started

---

## Summary Statistics

**Total Tests:** 3/6 attempted
**Success Rate:** 66.7% (2/3)
**Successful:** 2 ✅ | **Failed:** 1 ❌
**Total USDC Sent:** $0.20
**Total USDC Received:** $0.16
**Total Fees (USDC):** $0.04 (20%)
**Total Gas Spent:** ~$0.56 (ETH)
**Net Change:** -$0.60 total

**Issues Found:**
- ❌ Base → Optimism: Nonce management error (known issue)
