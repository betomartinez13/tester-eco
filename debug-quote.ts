/**
 * Debug script to see what contracts the solver returns
 */
import { SolverClient } from './src/clients/solver-client.js';
import { getChainId } from './src/config/chains.js';
import { getSolanaKeypair } from './src/clients/svm-client.js';
import { privateKeyToAccount } from 'viem/accounts';
import { getConfig } from './src/config/index.js';

const config = getConfig();
const solverClient = new SolverClient();

// Get wallet addresses
const evmAccount = privateKeyToAccount(config.privateKey as `0x${string}`);
const solanaKeypair = getSolanaKeypair();

console.log('EVM Wallet:', evmAccount.address);
console.log('Solana Wallet:', solanaKeypair.publicKey.toBase58());
console.log('\n=== Testing Optimism → Solana Quote ===\n');

// Request quote for Optimism → Solana
const quoteRequest = solverClient.buildQuoteRequest({
  sourceChainID: getChainId('optimism'),
  destinationChainID: getChainId('solana'),
  sourceToken: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // USDC on Optimism
  destinationToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC on Solana
  sourceAmount: '100000', // 0.1 USDC
  funder: evmAccount.address,
  recipient: solanaKeypair.publicKey.toBase58(),
});

const quoteResponse = await solverClient.getQuote(quoteRequest);

if ('validations' in quoteResponse && quoteResponse.validations.failed.length > 0) {
  console.error('Quote failed:', quoteResponse.validations.failed);
  process.exit(1);
}

console.log('Contract Addresses from Solver:');
console.log('================================');
console.log('Source Portal (Optimism):', quoteResponse.contracts.sourcePortal);
console.log('Destination Portal (Solana):', quoteResponse.contracts.destinationPortal);
console.log('Prover:', quoteResponse.contracts.prover);
console.log('\nQuote Details:');
console.log('Deadline:', quoteResponse.quoteResponses[0].deadline);
console.log('Deadline type:', typeof quoteResponse.quoteResponses[0].deadline);
console.log('Current timestamp:', Date.now());
console.log('Current timestamp (seconds):', Math.floor(Date.now() / 1000));
console.log('\n');

console.log('=== Testing Solana → Optimism Quote ===\n');

// Request quote for Solana → Optimism
const quoteRequest2 = solverClient.buildQuoteRequest({
  sourceChainID: getChainId('solana'),
  destinationChainID: getChainId('optimism'),
  sourceToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC on Solana
  destinationToken: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // USDC on Optimism
  sourceAmount: '100000', // 0.1 USDC
  funder: solanaKeypair.publicKey.toBase58(),
  recipient: evmAccount.address,
});

const quoteResponse2 = await solverClient.getQuote(quoteRequest2);

if ('validations' in quoteResponse2 && quoteResponse2.validations.failed.length > 0) {
  console.error('Quote failed:', quoteResponse2.validations.failed);
  process.exit(1);
}

console.log('Contract Addresses from Solver:');
console.log('================================');
console.log('Source Portal (Solana):', quoteResponse2.contracts.sourcePortal);
console.log('Destination Portal (Optimism):', quoteResponse2.contracts.destinationPortal);
console.log('Prover:', quoteResponse2.contracts.prover);
console.log('\nQuote Details:');
console.log('Deadline:', quoteResponse2.quoteResponses[0].deadline);
console.log('Deadline type:', typeof quoteResponse2.quoteResponses[0].deadline);
console.log('Deadline as BN:', quoteResponse2.quoteResponses[0].deadline.toString());
console.log('Current timestamp:', Date.now());
console.log('Current timestamp (seconds):', Math.floor(Date.now() / 1000));
