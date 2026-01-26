import { EventMonitor } from '../../src/services/event-monitor.js';
import { StateValidator } from '../../src/services/state-validator.js';
import { IntentReporter } from '../../src/reporters/intent-reporter.js';
import { IntentPublisher } from '../../src/services/intent-publisher.js';
import { SolverClient, isQuoteSuccess } from '../../src/clients/solver-client.js';
import { getConfig } from '../../src/config/index.js';
import { privateKeyToAccount } from 'viem/accounts';
import { getChainId, type SupportedChainName } from '../../src/config/chains.js';
import { getSolanaKeypair } from '../../src/clients/svm-client.js';
import type { Address, Hex } from 'viem';
import type { IntentData, QuoteData } from '../../src/types/intent.js';

// Token addresses for USDC on each chain
const USDC_ADDRESSES: Record<SupportedChainName, Address> = {
  optimism: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  solana: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' as Address, // SPL USDC
};

// Skip E2E tests unless explicitly enabled with RUN_E2E=true
const runE2E = process.env.RUN_E2E === 'true';
const describeE2E = runE2E ? describe : describe.skip;

describeE2E('Solana Intent Lifecycle E2E', () => {
  let publisher: IntentPublisher;
  let monitor: EventMonitor;
  let validator: StateValidator;
  let reporter: IntentReporter;
  let solverClient: SolverClient;
  let evmWalletAddress: string;
  let solanaWalletAddress: string;

  beforeAll(async () => {
    publisher = new IntentPublisher();
    monitor = new EventMonitor();
    validator = new StateValidator();
    reporter = new IntentReporter();
    solverClient = new SolverClient();

    // Get EVM wallet address from private key
    const config = getConfig();
    const evmAccount = privateKeyToAccount(config.privateKey as `0x${string}`);
    evmWalletAddress = evmAccount.address;

    // Get Solana wallet address
    const solanaKeypair = getSolanaKeypair();
    solanaWalletAddress = solanaKeypair.publicKey.toBase58();

    console.log(`EVM Wallet address: ${evmWalletAddress}`);
    console.log(`Solana Wallet address: ${solanaWalletAddress}`);
  });

  afterAll(async () => {
    reporter.printSummary();
    reporter.saveReport('./reports');
  });

  it('should complete Solana → Optimism lifecycle', async () => {
    const sourceChain = 'solana' as const;
    const destinationChain = 'optimism' as const;
    const sourceToken = USDC_ADDRESSES[sourceChain];
    const destToken = USDC_ADDRESSES[destinationChain];
    const amount = '100000';  // 0.1 USDC (10 cents)

    console.log('Starting Solana → Optimism intent lifecycle...');

    // Step 1: Get quote from solver
    console.log('Getting quote from solver...');
    const quoteRequest = solverClient.buildQuoteRequest({
      sourceChainID: getChainId(sourceChain),
      destinationChainID: getChainId(destinationChain),
      sourceToken,
      destinationToken: destToken,
      sourceAmount: amount,
      funder: solanaWalletAddress as Address,
      recipient: evmWalletAddress as Address,
    });

    const quoteResponse = await solverClient.getQuote(quoteRequest);
    if (!isQuoteSuccess(quoteResponse)) {
      throw new Error(`Quote failed: ${JSON.stringify(quoteResponse.validations.failed)}`);
    }

    const quote: QuoteData = {
      sourceAmount: quoteResponse.quoteResponses[0].sourceAmount,
      destinationAmount: quoteResponse.quoteResponses[0].destinationAmount,
      encodedRoute: quoteResponse.quoteResponses[0].encodedRoute as Hex,
      deadline: quoteResponse.quoteResponses[0].deadline,
      contracts: {
        sourcePortal: quoteResponse.contracts.sourcePortal as Address,
        destinationPortal: quoteResponse.contracts.destinationPortal as Address,
        prover: quoteResponse.contracts.prover as Address,
      },
    };

    // Step 2: Publish and fund intent
    console.log('Publishing and funding intent...');
    const intentData: IntentData = {
      sourceChain,
      destinationChain,
      sourceToken,
      destinationToken: destToken,
      funder: solanaWalletAddress as Address,
      recipient: evmWalletAddress as Address,
      quote,
    };

    const {
      intentHash,
      txHash: publishTx,
      sourcePortal,
      destinationPortal,
      prover,
    } = await publisher.publishAndFund(intentData);

    console.log(`Intent published: ${intentHash}`);
    console.log(`Transaction: ${publishTx}`);

    validator.initializeIntent(intentHash, 'solana', 'optimism');
    validator.recordState(intentHash, {
      state: 'PUBLISHED',
      timestamp: new Date(),
      txHash: publishTx,
    });
    validator.recordState(intentHash, {
      state: 'FUNDED',
      timestamp: new Date(),
      txHash: publishTx,
    });

    // Step 3: Wait for FULFILLED on Optimism (destination)
    console.log('Waiting for fulfillment on Optimism...');
    const fulfilled = await monitor.waitForFulfilled(
      intentHash,
      'optimism',
      destinationPortal as Address,
      { interval: 5000, timeout: 120000 }
    );
    expect(fulfilled).not.toBeNull();
    console.log(`Intent fulfilled at block ${fulfilled!.blockNumber}`);

    validator.recordState(intentHash, {
      state: 'FULFILLED',
      timestamp: new Date(),
      blockNumber: fulfilled!.blockNumber,
    });

    // Step 4: Poll for PROVEN on Solana (source)
    console.log('Waiting for proof on Solana...');
    const proven = await monitor.pollForProven(
      intentHash,
      'solana',
      prover as Address,
      { interval: 5000, timeout: 600000 }
    );
    expect(proven).not.toBeNull();
    console.log(`Intent proven at block ${proven!.blockNumber}`);

    validator.recordState(intentHash, {
      state: 'PROVEN',
      timestamp: new Date(),
      blockNumber: proven!.blockNumber,
    });

    // Step 5: Poll for WITHDRAWN on Solana (source)
    console.log('Waiting for withdrawal on Solana...');
    const withdrawn = await monitor.pollForWithdrawn(
      intentHash,
      'solana',
      sourcePortal as Address,
      { interval: 5000, timeout: 300000 }
    );
    expect(withdrawn).not.toBeNull();
    console.log(`Intent withdrawn at block ${withdrawn!.blockNumber}`);

    validator.recordState(intentHash, {
      state: 'WITHDRAWN',
      timestamp: new Date(),
      blockNumber: withdrawn!.blockNumber,
    });

    // Record journey for report
    const journey = validator.getJourney(intentHash);
    reporter.addJourney(journey!);

    expect(journey?.isComplete).toBe(true);
    expect(journey?.currentState).toBe('WITHDRAWN');
    console.log('Solana → Optimism lifecycle completed successfully!');
  }, 900000); // 15 minute timeout

  it('should complete Optimism → Solana lifecycle', async () => {
    const sourceChain = 'optimism' as const;
    const destinationChain = 'solana' as const;
    const sourceToken = USDC_ADDRESSES[sourceChain];
    const destToken = USDC_ADDRESSES[destinationChain];
    const amount = '100000';  // 0.1 USDC (10 cents)

    console.log('Starting Optimism → Solana intent lifecycle...');

    // Step 1: Get quote from solver
    console.log('Getting quote from solver...');
    const quoteRequest = solverClient.buildQuoteRequest({
      sourceChainID: getChainId(sourceChain),
      destinationChainID: getChainId(destinationChain),
      sourceToken,
      destinationToken: destToken,
      sourceAmount: amount,
      funder: evmWalletAddress as Address,
      recipient: solanaWalletAddress as Address,
    });

    const quoteResponse = await solverClient.getQuote(quoteRequest);
    if (!isQuoteSuccess(quoteResponse)) {
      throw new Error(`Quote failed: ${JSON.stringify(quoteResponse.validations.failed)}`);
    }

    const quote: QuoteData = {
      sourceAmount: quoteResponse.quoteResponses[0].sourceAmount,
      destinationAmount: quoteResponse.quoteResponses[0].destinationAmount,
      encodedRoute: quoteResponse.quoteResponses[0].encodedRoute as Hex,
      deadline: quoteResponse.quoteResponses[0].deadline,
      contracts: {
        sourcePortal: quoteResponse.contracts.sourcePortal as Address,
        destinationPortal: quoteResponse.contracts.destinationPortal as Address,
        prover: quoteResponse.contracts.prover as Address,
      },
    };

    // Step 2: Publish and fund intent
    console.log('Publishing and funding intent...');
    const intentData: IntentData = {
      sourceChain,
      destinationChain,
      sourceToken,
      destinationToken: destToken,
      funder: evmWalletAddress as Address,
      recipient: solanaWalletAddress as Address,
      quote,
    };

    const {
      intentHash,
      txHash: publishTx,
      sourcePortal,
      destinationPortal,
      prover,
    } = await publisher.publishAndFund(intentData);

    console.log(`Intent published: ${intentHash}`);
    console.log(`Transaction: ${publishTx}`);

    validator.initializeIntent(intentHash, 'optimism', 'solana');
    validator.recordState(intentHash, {
      state: 'PUBLISHED',
      timestamp: new Date(),
      txHash: publishTx,
    });
    validator.recordState(intentHash, {
      state: 'FUNDED',
      timestamp: new Date(),
      txHash: publishTx,
    });

    // Step 3: Wait for FULFILLED on Solana (destination)
    console.log('Waiting for fulfillment on Solana...');
    const fulfilled = await monitor.waitForFulfilled(
      intentHash,
      'solana',
      destinationPortal as Address,
      { interval: 5000, timeout: 120000 }
    );
    expect(fulfilled).not.toBeNull();
    console.log(`Intent fulfilled at block ${fulfilled!.blockNumber}`);

    validator.recordState(intentHash, {
      state: 'FULFILLED',
      timestamp: new Date(),
      blockNumber: fulfilled!.blockNumber,
    });

    // Step 4: Poll for PROVEN on Optimism (source)
    console.log('Waiting for proof on Optimism...');
    const proven = await monitor.pollForProven(
      intentHash,
      'optimism',
      prover as Address,
      { interval: 5000, timeout: 600000 }
    );
    expect(proven).not.toBeNull();
    console.log(`Intent proven at block ${proven!.blockNumber}`);

    validator.recordState(intentHash, {
      state: 'PROVEN',
      timestamp: new Date(),
      blockNumber: proven!.blockNumber,
    });

    // Step 5: Poll for WITHDRAWN on Optimism (source)
    console.log('Waiting for withdrawal on Optimism...');
    const withdrawn = await monitor.pollForWithdrawn(
      intentHash,
      'optimism',
      sourcePortal as Address,
      { interval: 5000, timeout: 300000 }
    );
    expect(withdrawn).not.toBeNull();
    console.log(`Intent withdrawn at block ${withdrawn!.blockNumber}`);

    validator.recordState(intentHash, {
      state: 'WITHDRAWN',
      timestamp: new Date(),
      blockNumber: withdrawn!.blockNumber,
    });

    // Record journey for report
    const journey = validator.getJourney(intentHash);
    reporter.addJourney(journey!);

    expect(journey?.isComplete).toBe(true);
    expect(journey?.currentState).toBe('WITHDRAWN');
    console.log('Optimism → Solana lifecycle completed successfully!');
  }, 900000); // 15 minute timeout
});
