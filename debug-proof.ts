/**
 * Debug script to check if prover contract has ANY IntentProven events
 */
import { createPublicClient, http } from 'viem';
import { optimism } from 'viem/chains';
import { getConfig } from './src/config/index.js';
import { PROVER_ABI } from './src/config/contracts.js';

const config = getConfig();

const client = createPublicClient({
  chain: optimism,
  transport: http(config.optimismRpcUrl),
});

// Replace with actual prover address from your test
const PROVER_ADDRESS = process.argv[2];

if (!PROVER_ADDRESS) {
  console.error('Usage: npx tsx debug-proof.ts <prover-address>');
  process.exit(1);
}

async function checkProverEvents() {
  console.log(`Checking prover contract: ${PROVER_ADDRESS}`);
  console.log('Looking for IntentProven events in last 10000 blocks...\n');

  const currentBlock = await client.getBlockNumber();
  const fromBlock = currentBlock - 10000n;

  console.log(`Current block: ${currentBlock}`);
  console.log(`Searching from block: ${fromBlock}\n`);

  // Check for ANY IntentProven events (no filter)
  const logs = await client.getLogs({
    address: PROVER_ADDRESS as any,
    event: PROVER_ABI[0],
    fromBlock,
    toBlock: 'latest',
  });

  console.log(`Found ${logs.length} IntentProven events total\n`);

  if (logs.length > 0) {
    console.log('Recent events:');
    logs.slice(-5).forEach((log, i) => {
      console.log(`\n${i + 1}. Block ${log.blockNumber}:`);
      console.log(`   Intent Hash: ${log.args.intentHash}`);
      console.log(`   Claimant: ${log.args.claimant}`);
      console.log(`   Destination: ${log.args.destination}`);
    });
  } else {
    console.log('❌ NO IntentProven events found in last 10000 blocks!');
    console.log('This could mean:');
    console.log('1. Wrong prover address');
    console.log('2. Solver is not submitting proofs for test amounts');
    console.log('3. Proofs are delayed/batched');
  }
}

checkProverEvents().catch(console.error);
