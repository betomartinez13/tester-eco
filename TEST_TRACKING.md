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
| 3 | Base | Optimism | 0.1 USDC | 0.07995 USDC | ~0.0001 ETH | Base: 2.15 USDC / Opt: ~0.06 USDC | Base: ~2.05 USDC / Opt: ~0.14 USDC | 133.3s | ✅ SUCCESS | Fee: 20% (0.02 USDC) - Nonce fix worked! |
| 4 | Base | Arbitrum | 0.1 USDC | 0.07995 USDC | ~0.0001 ETH | Base: ~2.05 USDC / Arb: ~1.21 USDC | Base: ~1.95 USDC / Arb: ~1.29 USDC | 121.8s | ✅ SUCCESS | Fee: 20% (0.02 USDC) |
| 5 | Arbitrum | Optimism | 0.1 USDC | 0.07995 USDC | ~0.0001 ETH | Arb: ~1.29 USDC / Opt: ~0.14 USDC | Arb: ~1.19 USDC / Opt: ~0.22 USDC | 153.7s | ✅ SUCCESS | Fee: 20% (0.02 USDC) |
| 6 | Arbitrum | Base | 0.1 USDC | 0.07995 USDC | ~0.0001 ETH | Arb: ~1.19 USDC / Base: ~1.95 USDC | Arb: ~1.09 USDC / Base: ~2.03 USDC | 159.0s | ✅ SUCCESS | Fee: 20% (0.02 USDC) - Previously timed out! |

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
**Status:** ✅ SUCCESS (Fixed after nonce issue!)

**Pre-Test:**
- Base Balance: 2.15 USDC + 0.00110 ETH
- Optimism Balance: ~0.06 USDC + ~0.000420 ETH (after Test #2)

**Transaction:**
- Intent Hash: `0x819a5449c348df9c93a13b0e4fc8cdc378726e30e9117a5205aaaed0499dfe8c`
- Tx Hash (Fund): `0x65b85adc0fbdbeb77e4532048df26ee1c24d359c25a6034c84de2f5c08368091`
- Amount Sent: 0.1 USDC
- Amount Received: 0.07995 USDC
- Fee: 0.020050 USDC (20%)
- Gas Fee: ~0.0001 ETH (~$0.28)
- Timestamp: Jan 30, 2026 03:52:53 UTC

**Timing:**
- FUNDED → FULFILLED: 6.3s (fastest yet!)
- FULFILLED → PROVEN: 26.8s
- PROVEN → WITHDRAWN: 100.3s (1m 40s)
- **Total: 133.3s (~2.2 minutes)**

**Blockchain Details:**
- Fulfilled Block (Optimism): 147073200
- Proven Block (Base): 41477929
- Withdrawn Block (Base): 41477977

**Post-Test:**
- Base Balance: ~2.05 USDC + ~0.00100 ETH
- Optimism Balance: ~0.14 USDC + ~0.000420 ETH

**Explorer Links:**
- Base Tx: https://basescan.org/tx/0x65b85adc0fbdbeb77e4532048df26ee1c24d359c25a6034c84de2f5c08368091
- Optimism Fulfill: https://optimistic.etherscan.io/block/147073200

**Note:** This route initially failed with nonce errors but was fixed by calculating `fundNonce = approveNonce + 1` instead of fetching from network (commit 0f1cb75)

---

### Test #4: Base → Arbitrum
**Status:** ✅ SUCCESS

**Pre-Test:**
- Base Balance: ~2.05 USDC + ~0.00100 ETH (after Test #3)
- Arbitrum Balance: ~1.21 USDC + 0.000620 ETH (after Test #2)

**Transaction:**
- Intent Hash: `0x012ace2a5b7c72dbe3fd9e0d30e66a2c17243247a38af7b80de2b3b0d7733eab`
- Tx Hash (Fund): `0xcf9c946a48f164ad48cd54eb517a4727702f362b821fb574a35a6211ce2745dd`
- Amount Sent: 0.1 USDC
- Amount Received: 0.07995 USDC
- Fee: 0.020050 USDC (20%)
- Gas Fee: ~0.0001 ETH (~$0.28)
- Timestamp: Jan 30, 2026 03:58:02 UTC

**Timing:**
- FUNDED → FULFILLED: 5.7s (FASTEST fulfillment!)
- FULFILLED → PROVEN: 11.0s
- PROVEN → WITHDRAWN: 105.1s (1m 45s)
- **Total: 121.8s (~2 minutes)**

**Blockchain Details:**
- Fulfilled Block (Arbitrum): 426678195
- Proven Block (Base): 41478075
- Withdrawn Block (Base): 41478127

**Post-Test:**
- Base Balance: ~1.95 USDC + ~0.00090 ETH
- Arbitrum Balance: ~1.29 USDC + 0.000620 ETH

**Explorer Links:**
- Base Tx: https://basescan.org/tx/0xcf9c946a48f164ad48cd54eb517a4727702f362b821fb574a35a6211ce2745dd
- Arbitrum Fulfill: https://arbiscan.io/block/426678195

---

### Test #5: Arbitrum → Optimism
**Status:** ✅ SUCCESS

**Pre-Test:**
- Arbitrum Balance: ~1.29 USDC + 0.000620 ETH (after Test #4)
- Optimism Balance: ~0.14 USDC + ~0.000420 ETH (after Test #3)

**Transaction:**
- Intent Hash: `0x9f94e51f0a79bdcfc6222a3449b21d9bb551981916673633155a6a596602ed30`
- Tx Hash (Fund): `0xc5cd0941670ee69e8bf77bcd3514bd10798e2a4a22b0e989233ee033bcb6b893`
- Amount Sent: 0.1 USDC
- Amount Received: 0.07995 USDC
- Fee: 0.020050 USDC (20%)
- Gas Fee: ~0.0001 ETH (~$0.28)
- Timestamp: Jan 30, 2026 04:02:28 UTC

**Timing:**
- FUNDED → FULFILLED: 6.1s
- FULFILLED → PROVEN: 26.6s
- PROVEN → WITHDRAWN: 121.1s (2m 1s)
- **Total: 153.7s (~2.6 minutes)**

**Blockchain Details:**
- Fulfilled Block (Optimism): 147073487
- Proven Block (Arbitrum): 426679362
- Withdrawn Block (Arbitrum): 426679859

**Post-Test:**
- Arbitrum Balance: ~1.19 USDC + ~0.000520 ETH
- Optimism Balance: ~0.22 USDC + ~0.000420 ETH

**Explorer Links:**
- Arbitrum Tx: https://arbiscan.io/tx/0xc5cd0941670ee69e8bf77bcd3514bd10798e2a4a22b0e989233ee033bcb6b893
- Optimism Fulfill: https://optimistic.etherscan.io/block/147073487

---

### Test #6: Arbitrum → Base
**Status:** ✅ SUCCESS (Previously timed out on Jan 26!)

**Pre-Test:**
- Arbitrum Balance: ~1.19 USDC + ~0.000520 ETH (after Test #5)
- Base Balance: ~1.95 USDC + ~0.00090 ETH (after Test #4)

**Transaction:**
- Intent Hash: `0xbae59a2428f72e17f7b1a22d2f32c9f996df3dad5312f328a2f2954d8bb8fb18`
- Tx Hash (Fund): `0x71842c73214fe99f4557817f0354b7d10586f136db7c30551dc9244783175177`
- Amount Sent: 0.1 USDC
- Amount Received: 0.07995 USDC
- Fee: 0.020050 USDC (20%)
- Gas Fee: ~0.0001 ETH (~$0.28)
- Timestamp: Jan 30, 2026 04:07:22 UTC

**Timing:**
- FUNDED → FULFILLED: 5.8s
- FULFILLED → PROVEN: 31.9s
- PROVEN → WITHDRAWN: 121.2s (2m 1s)
- **Total: 159.0s (~2.7 minutes)**

**Blockchain Details:**
- Fulfilled Block (Base): 41478349
- Proven Block (Arbitrum): 426680561
- Withdrawn Block (Arbitrum): 426681061

**Post-Test:**
- Arbitrum Balance: ~1.09 USDC + ~0.000420 ETH
- Base Balance: ~2.03 USDC + ~0.00090 ETH

**Explorer Links:**
- Arbitrum Tx: https://arbiscan.io/tx/0x71842c73214fe99f4557817f0354b7d10586f136db7c30551dc9244783175177
- Base Fulfill: https://basescan.org/block/41478349

**Note:** This route timed out on Jan 26 (stopped at PROVEN stage). Now it completes successfully with the nonce fix!

---

## Summary Statistics

**Total Tests:** 6/6 completed ✅
**Success Rate:** 100% (6/6) 🎉🎉🎉
**Total USDC Sent:** $0.60
**Total USDC Received:** $0.48
**Total Fees (USDC):** $0.12 (20% avg)
**Total Gas Spent:** ~$1.68 (ETH)
**Net Change:** -$1.80 total

**Performance Notes:**
- Fastest fulfillment: 5.7s (Base → Arbitrum)
- Fastest total time: 76.0s (Optimism → Arbitrum)
- Slowest total time: 159.0s (Arbitrum → Base)
- Average total time: ~124s (~2 minutes)

**Issues Fixed:**
- ✅ Base → Optimism: Nonce error FIXED (commit 0f1cb75)
- ✅ Arbitrum → Base: Previously timed out (Jan 26), now works!

**ALL 6 EVM ROUTES TESTED AND WORKING! 🚀**
