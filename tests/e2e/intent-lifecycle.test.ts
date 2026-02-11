import { EventMonitor } from '../../src/services/event-monitor.js';
import { StateValidator } from '../../src/services/state-validator.js';
import { IntentReporter } from '../../src/reporters/intent-reporter.js';
import { IntentPublisher } from '../../src/services/intent-publisher.js';
import { SolverClient, isQuoteSuccess } from '../../src/clients/solver-client.js';
import { getConfig } from '../../src/config/index.js';
import { privateKeyToAccount } from 'viem/accounts';
import { type SupportedChainName } from '../../src/config/chains.js';
import { extractUsdcAddresses, mapChainName } from '../../src/utils/chain-utils.js';
import type { Address, Hex } from 'viem';
import type { IntentData, QuoteData } from '../../src/types/intent.js';

// USDC addresses and chain IDs fetched dynamically from solver API
let USDC_ADDRESSES: Record<SupportedChainName, Address>;
let CHAIN_IDS: Record<SupportedChainName, number> = {} as Record<SupportedChainName, number>;

// Skip E2E tests unless explicitly enabled with RUN_E2E=true
const runE2E = process.env.RUN_E2E === 'true';
const describeE2E = runE2E ? describe : describe.skip;

describeE2E('Intent Lifecycle E2E', () => {
  let publisher: IntentPublisher;
  let monitor: EventMonitor;
  let validator: StateValidator;
  let reporter: IntentReporter;
  let solverClient: SolverClient;
  let walletAddress: string;

  beforeAll(async () => {
    publisher = new IntentPublisher();
    monitor = new EventMonitor();
    validator = new StateValidator();
    reporter = new IntentReporter();
    solverClient = new SolverClient();

    // Fetch blockchain chains from solver API
    console.log('Fetching supported chains from solver API...');
    const chains = await solverClient.getBlockchainChains();
    console.log(`Found ${chains.length} supported chains: ${chains.map(c => c.chainName).join(', ')}`);

    // Extract USDC addresses and chain IDs dynamically
    USDC_ADDRESSES = extractUsdcAddresses(chains);
    for (const chain of chains) {
      const name = mapChainName(chain.chainName);
      if (name) {
        CHAIN_IDS[name] = chain.chainId;
      }
    }
    console.log('USDC addresses loaded for:', Object.keys(USDC_ADDRESSES).join(', '));

    // Get wallet address from private key
    const config = getConfig();
    const account = privateKeyToAccount(config.privateKey as `0x${string}`);
    walletAddress = account.address;

    console.log(`Wallet address: ${walletAddress}`);
  });

  afterAll(async () => {
    reporter.printSummary();
    reporter.saveReport('./reports');
  });

  it('should complete Optimism → Base lifecycle', async () => {
    const sourceChain = 'optimism' as const;
    const destinationChain = 'base' as const;
    const sourceToken = USDC_ADDRESSES[sourceChain];
    const destToken = USDC_ADDRESSES[destinationChain];
    const amount = '100000';  // 0.1 USDC (10 cents)

    console.log('Starting Optimism → Base intent lifecycle...');

    // Step 1: Get quote from solver
    console.log('Getting quote from solver...');
    const quoteRequest = solverClient.buildQuoteRequest({
      sourceChainID: CHAIN_IDS[sourceChain],
      destinationChainID: CHAIN_IDS[destinationChain],
      sourceToken,
      destinationToken: destToken,
      sourceAmount: amount,
      funder: walletAddress as Address,
      recipient: walletAddress as Address,
    });

    const quoteResponse = await solverClient.getQuote(quoteRequest);
    if (!isQuoteSuccess(quoteResponse)) {
      throw new Error(`Quote failed: ${JSON.stringify(quoteResponse.validations.failed)}`);
    }

    // Fix deadline if it's in the past (solver API bug)
    const apiDeadline = quoteResponse.quoteResponses[0].deadline;
    const now = Math.floor(Date.now() / 1000);
    console.log(`🔍 DEBUG: API deadline: ${apiDeadline}, Current time: ${now}, Expired: ${apiDeadline <= now}`);
    const validDeadline = apiDeadline > now ? apiDeadline : now + 3600; // Use API deadline if valid, else 1 hour from now

    if (apiDeadline <= now) {
      console.log(`⚠️ Warning: API returned expired deadline ${apiDeadline} (current: ${now}), using ${validDeadline}`);
    }
    console.log(`🔍 DEBUG: Using deadline: ${validDeadline}`);

    const quote: QuoteData = {
      sourceAmount: quoteResponse.quoteResponses[0].sourceAmount,
      destinationAmount: quoteResponse.quoteResponses[0].destinationAmount,
      encodedRoute: quoteResponse.quoteResponses[0].encodedRoute as Hex,
      deadline: validDeadline,
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
      funder: walletAddress as Address,
      recipient: walletAddress as Address,
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

    validator.initializeIntent(intentHash, 'optimism', 'base');
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

    // Step 2: Wait for FULFILLED on Base (destination)
    console.log('Waiting for fulfillment on Base...');
    const fulfilled = await monitor.waitForFulfilled(
      intentHash,
      'base',
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

    // Step 3: Poll for PROVEN on Optimism (source)
    console.log('Waiting for proof on Optimism...');
    const proven = await monitor.pollForProven(
      intentHash,
      'optimism',
      prover as Address,
      { interval: 5000, timeout: 180000 }
    );
    expect(proven).not.toBeNull();
    console.log(`Intent proven at block ${proven!.blockNumber}`);

    validator.recordState(intentHash, {
      state: 'PROVEN',
      timestamp: new Date(),
      blockNumber: proven!.blockNumber,
    });

    // Step 4: Poll for WITHDRAWN on Optimism (source)
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
    console.log('Optimism → Base lifecycle completed successfully!');
  }, 600000); // 10 minute timeout

  it('should complete Optimism → Arbitrum lifecycle', async () => {
    const sourceChain = 'optimism' as const;
    const destinationChain = 'arbitrum' as const;
    const sourceToken = USDC_ADDRESSES[sourceChain];
    const destToken = USDC_ADDRESSES[destinationChain];
    const amount = '100000';  // 0.1 USDC (10 cents)

    console.log('Starting Optimism → Arbitrum intent lifecycle...');

    // Step 1: Get quote from solver
    console.log('Getting quote from solver...');
    const quoteRequest = solverClient.buildQuoteRequest({
      sourceChainID: CHAIN_IDS[sourceChain],
      destinationChainID: CHAIN_IDS[destinationChain],
      sourceToken,
      destinationToken: destToken,
      sourceAmount: amount,
      funder: walletAddress as Address,
      recipient: walletAddress as Address,
    });

    const quoteResponse = await solverClient.getQuote(quoteRequest);
    if (!isQuoteSuccess(quoteResponse)) {
      throw new Error(`Quote failed: ${JSON.stringify(quoteResponse.validations.failed)}`);
    }

    // Fix deadline if it's in the past (solver API bug)
    const apiDeadline = quoteResponse.quoteResponses[0].deadline;
    const now = Math.floor(Date.now() / 1000);
    console.log(`🔍 DEBUG: API deadline: ${apiDeadline}, Current time: ${now}, Expired: ${apiDeadline <= now}`);
    const validDeadline = apiDeadline > now ? apiDeadline : now + 3600; // Use API deadline if valid, else 1 hour from now

    if (apiDeadline <= now) {
      console.log(`⚠️ Warning: API returned expired deadline ${apiDeadline} (current: ${now}), using ${validDeadline}`);
    }
    console.log(`🔍 DEBUG: Using deadline: ${validDeadline}`);

    const quote: QuoteData = {
      sourceAmount: quoteResponse.quoteResponses[0].sourceAmount,
      destinationAmount: quoteResponse.quoteResponses[0].destinationAmount,
      encodedRoute: quoteResponse.quoteResponses[0].encodedRoute as Hex,
      deadline: validDeadline,
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
      funder: walletAddress as Address,
      recipient: walletAddress as Address,
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

    validator.initializeIntent(intentHash, 'optimism', 'arbitrum');
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

    // Step 2: Wait for FULFILLED on Arbitrum (destination)
    console.log('Waiting for fulfillment on Arbitrum...');
    const fulfilled = await monitor.waitForFulfilled(
      intentHash,
      'arbitrum',
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

    // Step 3: Poll for PROVEN on Optimism (source)
    console.log('Waiting for proof on Optimism...');
    const proven = await monitor.pollForProven(
      intentHash,
      'optimism',
      prover as Address,
      { interval: 5000, timeout: 180000 }
    );
    expect(proven).not.toBeNull();
    console.log(`Intent proven at block ${proven!.blockNumber}`);

    validator.recordState(intentHash, {
      state: 'PROVEN',
      timestamp: new Date(),
      blockNumber: proven!.blockNumber,
    });

    // Step 4: Poll for WITHDRAWN on Optimism (source)
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
    console.log('Optimism → Arbitrum lifecycle completed successfully!');
  }, 600000); // 10 minute timeout

  it('should complete Base → Polygon lifecycle', async () => {
    const sourceChain = 'base' as const;
    const destinationChain = 'polygon' as const;
    const sourceToken = USDC_ADDRESSES[sourceChain];
    const destToken = USDC_ADDRESSES[destinationChain];
    const amount = '100000';  // 0.1 USDC (10 cents)

    console.log('Starting Base → Polygon intent lifecycle...');

    // Step 1: Get quote from solver
    console.log('Getting quote from solver...');
    const quoteRequest = solverClient.buildQuoteRequest({
      sourceChainID: CHAIN_IDS[sourceChain],
      destinationChainID: CHAIN_IDS[destinationChain],
      sourceToken,
      destinationToken: destToken,
      sourceAmount: amount,
      funder: walletAddress as Address,
      recipient: walletAddress as Address,
    });

    const quoteResponse = await solverClient.getQuote(quoteRequest);
    if (!isQuoteSuccess(quoteResponse)) {
      throw new Error(`Quote failed: ${JSON.stringify(quoteResponse.validations.failed)}`);
    }

    // Fix deadline if it's in the past (solver API bug)
    const apiDeadline = quoteResponse.quoteResponses[0].deadline;
    const now = Math.floor(Date.now() / 1000);
    console.log(`🔍 DEBUG: API deadline: ${apiDeadline}, Current time: ${now}, Expired: ${apiDeadline <= now}`);
    const validDeadline = apiDeadline > now ? apiDeadline : now + 3600; // Use API deadline if valid, else 1 hour from now

    if (apiDeadline <= now) {
      console.log(`⚠️ Warning: API returned expired deadline ${apiDeadline} (current: ${now}), using ${validDeadline}`);
    }
    console.log(`🔍 DEBUG: Using deadline: ${validDeadline}`);

    const quote: QuoteData = {
      sourceAmount: quoteResponse.quoteResponses[0].sourceAmount,
      destinationAmount: quoteResponse.quoteResponses[0].destinationAmount,
      encodedRoute: quoteResponse.quoteResponses[0].encodedRoute as Hex,
      deadline: validDeadline,
      contracts: {
        sourcePortal: quoteResponse.contracts.sourcePortal as Address,
        destinationPortal: quoteResponse.contracts.destinationPortal as Address,
        prover: quoteResponse.contracts.prover as Address,
      },
    };

    // DEBUG: Log portal addresses from API
    console.log('📍 API Portal Addresses:');
    console.log('  Source Portal:', quoteResponse.contracts.sourcePortal);
    console.log('  Destination Portal:', quoteResponse.contracts.destinationPortal);
    console.log('  Prover:', quoteResponse.contracts.prover);

    // Step 2: Publish and fund intent
    console.log('Publishing and funding intent...');
    const intentData: IntentData = {
      sourceChain,
      destinationChain,
      sourceToken,
      destinationToken: destToken,
      funder: walletAddress as Address,
      recipient: walletAddress as Address,
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

    validator.initializeIntent(intentHash, 'base', 'polygon');
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

    // Step 2: Wait for FULFILLED on Polygon (destination)
    console.log('Waiting for fulfillment on Polygon...');
    const fulfilled = await monitor.waitForFulfilled(
      intentHash,
      'polygon',
      destinationPortal as Address,
      { interval: 5000, timeout: 600000 } // 10 minutes - Polygon takes longer
    );
    expect(fulfilled).not.toBeNull();
    console.log(`Intent fulfilled at block ${fulfilled!.blockNumber}`);

    validator.recordState(intentHash, {
      state: 'FULFILLED',
      timestamp: new Date(),
      blockNumber: fulfilled!.blockNumber,
    });

    // Step 3: Poll for PROVEN on Base (source)
    console.log('Waiting for proof on Base...');
    const proven = await monitor.pollForProven(
      intentHash,
      'base',
      prover as Address,
      { interval: 5000, timeout: 180000 }
    );
    expect(proven).not.toBeNull();
    console.log(`Intent proven at block ${proven!.blockNumber}`);

    validator.recordState(intentHash, {
      state: 'PROVEN',
      timestamp: new Date(),
      blockNumber: proven!.blockNumber,
    });

    // Step 4: Poll for WITHDRAWN on Base (source)
    console.log('Waiting for withdrawal on Base...');
    const withdrawn = await monitor.pollForWithdrawn(
      intentHash,
      'base',
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
    console.log('Base → Polygon lifecycle completed successfully!');
  }, 600000); // 10 minute timeout
});
