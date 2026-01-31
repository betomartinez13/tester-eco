/**
 * Test Dynamic Chain Fetching
 *
 * This script tests the dynamic chain loading from the solver API.
 * NO TRANSACTIONS - NO COST - 100% FREE
 */

import { SolverClient } from '../src/clients/solver-client.js';
import { extractUsdcAddresses, getSupportedChainNames } from '../src/utils/chain-utils.js';

async function testDynamicChains() {
  console.log('🔍 Testing Dynamic Chain Fetching from Solver API...\n');

  try {
    // Create solver client
    const solverClient = new SolverClient();

    // Fetch chains from API
    console.log('📡 Fetching chains from: https://solver-magenta.eco.com/api/v1/blockchain/chains');
    const chains = await solverClient.getBlockchainChains();

    console.log(`\n✅ Successfully fetched ${chains.length} chains!\n`);

    // Display all chains
    console.log('═══════════════════════════════════════════════════════════');
    console.log('DISCOVERED CHAINS:');
    console.log('═══════════════════════════════════════════════════════════\n');

    chains.forEach((chain, index) => {
      console.log(`${index + 1}. ${chain.chainName}`);
      console.log(`   Chain ID: ${chain.chainId}`);
      console.log(`   Type: ${chain.chainType}`);
      console.log(`   Tokens: ${chain.tokens.map(t => t.symbol).join(', ')}`);
      console.log(`   Wallets: ${chain.wallets.length}`);
      console.log('');
    });

    // Extract USDC addresses
    console.log('═══════════════════════════════════════════════════════════');
    console.log('USDC TOKEN ADDRESSES (Dynamically Extracted):');
    console.log('═══════════════════════════════════════════════════════════\n');

    const usdcAddresses = extractUsdcAddresses(chains);

    Object.entries(usdcAddresses).forEach(([chainName, address]) => {
      console.log(`${chainName.padEnd(15)} => ${address}`);
    });

    // Get supported chain names
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('SUPPORTED CHAIN NAMES (Internal Format):');
    console.log('═══════════════════════════════════════════════════════════\n');

    const supportedNames = getSupportedChainNames(chains);
    console.log(supportedNames.join(', '));

    // Summary
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('SUMMARY:');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`Total Chains Discovered: ${chains.length}`);
    console.log(`EVM Chains: ${chains.filter(c => c.chainType === 'EVM').length}`);
    console.log(`SVM Chains: ${chains.filter(c => c.chainType === 'SVM').length}`);
    console.log(`Chains with USDC: ${Object.keys(usdcAddresses).length}`);

    console.log('\n✅ Dynamic chain fetching works perfectly!');
    console.log('💰 Cost: $0.00 (no transactions made)\n');

  } catch (error) {
    console.error('❌ Error fetching chains:', error);
    process.exit(1);
  }
}

// Run the test
testDynamicChains();
