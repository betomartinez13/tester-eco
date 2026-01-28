/**
 * Debug script to show dev exactly how we handle deadline
 */
import BN from 'bn.js';
import { getPortalBorshCoder } from './src/utils/portal-borsh-coder.js';
import { toBorshReward } from './src/utils/borsh-converter.js';
import { PublicKey } from '@solana/web3.js';
import { keccak256 } from 'viem';

// Simulate the deadline from solver
const quoteDeadline = 1769618631; // number (seconds)

console.log('=== Deadline Handling Debug ===\n');
console.log('1. Deadline from Solver Quote:');
console.log('   Value:', quoteDeadline);
console.log('   Type:', typeof quoteDeadline);
console.log('   In seconds:', quoteDeadline);
console.log('   Human readable:', new Date(quoteDeadline * 1000).toISOString());
console.log();

// Step 1: Convert to string (what we do in svm-publisher.ts)
const deadlineAsString = String(quoteDeadline);
console.log('2. After String() conversion (for hash calculation):');
console.log('   Value:', deadlineAsString);
console.log('   Type:', typeof deadlineAsString);
console.log();

// Step 2: Convert to BN for Borsh encoding (hash calculation)
const deadlineAsBN = new BN(deadlineAsString);
console.log('3. After BN conversion (for Borsh encoding):');
console.log('   Value:', deadlineAsBN.toString());
console.log('   Type:', typeof deadlineAsBN);
console.log('   As number:', deadlineAsBN.toNumber());
console.log('   As hex:', '0x' + deadlineAsBN.toString(16));
console.log();

// Step 3: Encode with Borsh (what happens in hash calculation)
const mockReward = {
  deadline: deadlineAsString,
  creator: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Mock Solana address
  prover: '9KjnMTgJcdrWJrsMc7yj8UPkjzKr68cs2ugN2fYzyE6s', // Mock prover
  nativeAmount: '0',
  tokens: [{
    token: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amount: '100000',
  }],
};

const borshReward = toBorshReward(mockReward);
console.log('4. After Borsh conversion:');
console.log('   deadline field:', borshReward.deadline.toString());
console.log('   deadline as number:', borshReward.deadline.toNumber());
console.log();

// Step 4: Encode with Anchor Borsh Coder
const coder = getPortalBorshCoder();
const encoded = coder.types.encode('Reward', borshReward);
console.log('5. Borsh encoded bytes:');
console.log('   First 8 bytes (deadline):', Buffer.from(encoded.slice(0, 8)).toString('hex'));
console.log('   Full length:', encoded.length, 'bytes');
console.log();

// Step 5: What the transaction receives
console.log('6. What Anchor transaction receives:');
const transactionDeadline = new BN(deadlineAsString);
console.log('   Value:', transactionDeadline.toString());
console.log('   As u64:', transactionDeadline.toNumber());
console.log('   As hex:', '0x' + transactionDeadline.toString(16));
console.log();

// Verify both paths use same value
console.log('7. Verification:');
console.log('   Hash calculation deadline:', deadlineAsBN.toString());
console.log('   Transaction deadline:', transactionDeadline.toString());
console.log('   Match:', deadlineAsBN.eq(transactionDeadline) ? '✅ YES' : '❌ NO');
console.log();

// Show what EVM does for comparison
console.log('8. EVM Comparison (for reference):');
const evmDeadline = BigInt(quoteDeadline);
console.log('   EVM uses BigInt:', evmDeadline.toString());
console.log('   SVM uses BN:', transactionDeadline.toString());
console.log('   Values match:', evmDeadline.toString() === transactionDeadline.toString() ? '✅ YES' : '❌ NO');
