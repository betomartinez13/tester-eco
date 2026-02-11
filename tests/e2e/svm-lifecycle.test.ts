import { EventMonitor } from '../../src/services/event-monitor.js';
import { StateValidator } from '../../src/services/state-validator.js';
import { IntentReporter } from '../../src/reporters/intent-reporter.js';
import { IntentPublisher } from '../../src/services/intent-publisher.js';
import { SolverClient, isQuoteSuccess } from '../../src/clients/solver-client.js';
import { getConfig } from '../../src/config/index.js';
import { privateKeyToAccount } from 'viem/accounts';
import { type SupportedChainName } from '../../src/config/chains.js';
import { getSolanaKeypair } from '../../src/clients/svm-client.js';
import { extractUsdcAddresses, mapChainName } from '../../src/utils/chain-utils.js';
import type { Address, Hex } from 'viem';
import type { IntentData, IntentJourney, QuoteData } from '../../src/types/intent.js';

// USDC addresses and chain IDs fetched dynamically from solver API
let USDC_ADDRESSES: Record<SupportedChainName, Address>;
let CHAIN_IDS: Record<SupportedChainName, number> = {} as Record<SupportedChainName, number>;

interface TestIntentParams {
  sourceChain: SupportedChainName;
  destinationChain: SupportedChainName;
  amount: string;
}

// Skip E2E tests unless explicitly enabled with RUN_E2E=true
const runE2E = process.env.RUN_E2E === 'true';
const describeE2E = runE2E ? describe : describe.skip;

describeE2E('Solana Cross-Chain Intent Lifecycle E2E', () => {
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

  async function executeLifecycle(params: TestIntentParams): Promise<IntentJourney> {
    console.log(`\n🚀 Starting ${params.sourceChain} → ${params.destinationChain} lifecycle...`);

    const sourceToken = USDC_ADDRESSES[params.sourceChain];
    const destToken = USDC_ADDRESSES[params.destinationChain];

    // Determine funder and recipient based on which chain is Solana
    const isSolanaSource = params.sourceChain === 'solana';
    const funder = isSolanaSource ? (solanaWalletAddress as Address) : (evmWalletAddress as Address);
    const recipient = isSolanaSource ? (evmWalletAddress as Address) : (solanaWalletAddress as Address);

    // Step 1: Get quote from solver
    console.log('📋 Getting quote from solver...');
    const quoteRequest = solverClient.buildQuoteRequest({
      sourceChainID: CHAIN_IDS[params.sourceChain],
      destinationChainID: CHAIN_IDS[params.destinationChain],
      sourceToken,
      destinationToken: destToken,
      sourceAmount: params.amount,
      funder,
      recipient,
    });

    const quoteResponse = await solverClient.getQuote(quoteRequest);
    if (!isQuoteSuccess(quoteResponse)) {
      throw new Error(`Quote failed: ${JSON.stringify(quoteResponse.validations.failed)}`);
    }

    // Fix deadline if it's in the past (solver API bug)
    const apiDeadline = quoteResponse.quoteResponses[0].deadline;
    const now = Math.floor(Date.now() / 1000);
    const validDeadline = apiDeadline > now ? apiDeadline : now + 3600; // Use API deadline if valid, else 1 hour from now

    if (apiDeadline <= now) {
      console.log(`⚠️ Warning: API returned expired deadline ${apiDeadline} (current: ${now}), using ${validDeadline}`);
    }

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

    console.log(`  Source Amount: ${quote.sourceAmount} (${(parseInt(quote.sourceAmount) / 1e6).toFixed(2)} USDC)`);
    console.log(`  Destination Amount: ${quote.destinationAmount} (${(parseInt(quote.destinationAmount) / 1e6).toFixed(2)} USDC)`);
    console.log(`  Fee: ${((parseInt(quote.sourceAmount) - parseInt(quote.destinationAmount)) / 1e6).toFixed(5)} USDC`);
    console.log(`  Deadline: ${quote.deadline} (${new Date(Number(quote.deadline) * 1000).toISOString()})`);

    // Step 2: Publish and fund intent
    const intentData: IntentData = {
      sourceChain: params.sourceChain,
      destinationChain: params.destinationChain,
      sourceToken,
      destinationToken: destToken,
      funder,
      recipient,
      quote,
    };

    console.log('💰 Publishing and funding intent...');
    const startTime = Date.now();

    const {
      intentHash,
      txHash: publishTx,
      sourcePortal,
      destinationPortal,
      prover,
    } = await publisher.publishAndFund(intentData);

    const fundedTime = Date.now();
    console.log(`✅ Intent ${intentHash.slice(0, 10)}... FUNDED`);
    console.log(`  Tx Hash: ${publishTx}`);

    validator.initializeIntent(intentHash, params.sourceChain, params.destinationChain);
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

    // Step 3: Wait for FULFILLED on destination chain
    console.log(`⏳ Waiting for fulfillment on ${params.destinationChain}...`);
    const fulfilled = await monitor.waitForFulfilled(
      intentHash,
      params.destinationChain,
      destinationPortal as Address,
      { interval: 5000, timeout: 120000 } // 2 minutes
    );
    expect(fulfilled).not.toBeNull();

    const fulfilledTime = Date.now();
    const fundedToFulfilled = ((fulfilledTime - fundedTime) / 1000).toFixed(1);
    console.log(`✅ Intent ${intentHash.slice(0, 10)}... FULFILLED (${fundedToFulfilled}s)`);
    console.log(`  Block: ${fulfilled!.blockNumber}`);

    validator.recordState(intentHash, {
      state: 'FULFILLED',
      timestamp: new Date(),
      blockNumber: fulfilled!.blockNumber,
    });

    // Step 4: Poll for PROVEN on source chain
    console.log(`⏳ Waiting for proof on ${params.sourceChain}...`);
    const proven = await monitor.pollForProven(
      intentHash,
      params.sourceChain,
      prover as Address,
      { interval: 5000, timeout: 180000 } // 3 minutes
    );
    expect(proven).not.toBeNull();

    const provenTime = Date.now();
    const fulfilledToProven = ((provenTime - fulfilledTime) / 1000).toFixed(1);
    console.log(`✅ Intent ${intentHash.slice(0, 10)}... PROVEN (${fulfilledToProven}s)`);
    console.log(`  Block: ${proven!.blockNumber}`);

    validator.recordState(intentHash, {
      state: 'PROVEN',
      timestamp: new Date(),
      blockNumber: proven!.blockNumber,
    });

    // Step 5: Poll for WITHDRAWN on source chain
    console.log(`⏳ Waiting for withdrawal on ${params.sourceChain}...`);
    const withdrawn = await monitor.pollForWithdrawn(
      intentHash,
      params.sourceChain,
      sourcePortal as Address,
      { interval: 5000, timeout: 300000 } // 5 minutes
    );
    expect(withdrawn).not.toBeNull();

    const withdrawnTime = Date.now();
    const provenToWithdrawn = ((withdrawnTime - provenTime) / 1000).toFixed(1);
    const totalTime = ((withdrawnTime - fundedTime) / 1000).toFixed(1);
    console.log(`✅ Intent ${intentHash.slice(0, 10)}... WITHDRAWN (${provenToWithdrawn}s) | Total: ${totalTime}s`);
    console.log(`  Block: ${withdrawn!.blockNumber}`);

    validator.recordState(intentHash, {
      state: 'WITHDRAWN',
      timestamp: new Date(),
      blockNumber: withdrawn!.blockNumber,
    });

    // Get journey and verify completion
    const journey = validator.getJourney(intentHash);
    expect(journey?.isComplete).toBe(true);
    expect(journey?.currentState).toBe('WITHDRAWN');

    console.log(`🎉 ${params.sourceChain} → ${params.destinationChain} completed successfully!`);

    return journey!;
  }

  // All 6 SVM routes: 3 from Solana, 3 to Solana
  const allRoutes: TestIntentParams[] = [
    { sourceChain: 'solana', destinationChain: 'optimism', amount: '100000' },
    { sourceChain: 'solana', destinationChain: 'base', amount: '100000' },
    { sourceChain: 'solana', destinationChain: 'arbitrum', amount: '100000' },
    { sourceChain: 'optimism', destinationChain: 'solana', amount: '100000' },
    { sourceChain: 'base', destinationChain: 'solana', amount: '100000' },
    { sourceChain: 'arbitrum', destinationChain: 'solana', amount: '100000' },
  ];

  it.each(allRoutes)(
    'should complete $sourceChain → $destinationChain lifecycle',
    async (params) => {
      const journey = await executeLifecycle(params);
      reporter.addJourney(journey);

      expect(journey.isComplete).toBe(true);
      expect(journey.currentState).toBe('WITHDRAWN');
    },
    900000 // 15 minute timeout per route
  );
});
