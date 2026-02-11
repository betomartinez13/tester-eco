import { EventMonitor } from '../../src/services/event-monitor.js';
import { StateValidator } from '../../src/services/state-validator.js';
import { IntentReporter } from '../../src/reporters/intent-reporter.js';
import { IntentPublisher } from '../../src/services/intent-publisher.js';
import { SolverClient, isQuoteSuccess } from '../../src/clients/solver-client.js';
import { getConfig } from '../../src/config/index.js';
import { privateKeyToAccount } from 'viem/accounts';
import { type SupportedChainName } from '../../src/config/chains.js';
import { extractUsdcAddresses, mapChainName } from '../../src/utils/chain-utils.js';
import type { IntentData, IntentJourney, QuoteData } from '../../src/types/intent.js';
import type { Address, Hex } from 'viem';

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

describeE2E('Parallel Intent Execution', () => {
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

    const config = getConfig();
    const account = privateKeyToAccount(config.privateKey as `0x${string}`);
    walletAddress = account.address;

    console.log(`Wallet address: ${walletAddress}`);
  });

  afterAll(() => {
    reporter.printSummary();
    reporter.saveReport('./reports');
  });

  async function executeLifecycle(params: TestIntentParams): Promise<IntentJourney> {
    console.log(`Starting ${params.sourceChain} → ${params.destinationChain} lifecycle...`);

    const sourceToken = USDC_ADDRESSES[params.sourceChain];
    const destToken = USDC_ADDRESSES[params.destinationChain];

    // Get quote from solver
    const quoteRequest = solverClient.buildQuoteRequest({
      sourceChainID: CHAIN_IDS[params.sourceChain],
      destinationChainID: CHAIN_IDS[params.destinationChain],
      sourceToken,
      destinationToken: destToken,
      sourceAmount: params.amount,
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

    const intentData: IntentData = {
      sourceChain: params.sourceChain,
      destinationChain: params.destinationChain,
      sourceToken,
      destinationToken: destToken,
      funder: walletAddress as Address,
      recipient: walletAddress as Address,
      quote,
    };

    // Publish and fund intent
    const startTime = Date.now();
    const {
      intentHash,
      txHash,
      sourcePortal,
      destinationPortal,
      prover,
    } = await publisher.publishAndFund(intentData);

    const fundedTime = Date.now();
    console.log(`✅ Intent ${intentHash.slice(0, 10)}... FUNDED`);

    validator.initializeIntent(intentHash, intentData.sourceChain, intentData.destinationChain);
    validator.recordState(intentHash, { state: 'PUBLISHED', timestamp: new Date(), txHash });
    validator.recordState(intentHash, { state: 'FUNDED', timestamp: new Date(), txHash });

    // Wait for fulfillment on destination chain
    const fulfilled = await monitor.waitForFulfilled(
      intentHash,
      intentData.destinationChain,
      destinationPortal as Address,
      { interval: 5000, timeout: 120000 }
    );

    if (fulfilled) {
      const fulfilledTime = Date.now();
      const fundedToFulfilled = ((fulfilledTime - fundedTime) / 1000).toFixed(1);
      console.log(`✅ Intent ${intentHash.slice(0, 10)}... FULFILLED (${fundedToFulfilled}s)`);
      validator.recordState(intentHash, {
        state: 'FULFILLED',
        timestamp: new Date(),
        blockNumber: fulfilled.blockNumber,
      });

      // Wait for proof on source chain
      const proven = await monitor.pollForProven(
        intentHash,
        intentData.sourceChain,
        prover as Address,
        { interval: 5000, timeout: 180000 }
      );

      if (proven) {
        const provenTime = Date.now();
        const fulfilledToProven = ((provenTime - fulfilledTime) / 1000).toFixed(1);
        console.log(`✅ Intent ${intentHash.slice(0, 10)}... PROVEN (${fulfilledToProven}s)`);
        validator.recordState(intentHash, {
          state: 'PROVEN',
          timestamp: new Date(),
          blockNumber: proven.blockNumber,
        });

        // Wait for withdrawal on source chain
        const withdrawn = await monitor.pollForWithdrawn(
          intentHash,
          intentData.sourceChain,
          sourcePortal as Address,
          { interval: 5000, timeout: 300000 }
        );

        if (withdrawn) {
          const withdrawnTime = Date.now();
          const provenToWithdrawn = ((withdrawnTime - provenTime) / 1000).toFixed(1);
          const totalTime = ((withdrawnTime - fundedTime) / 1000).toFixed(1);
          console.log(`✅ Intent ${intentHash.slice(0, 10)}... WITHDRAWN (${provenToWithdrawn}s) | Total: ${totalTime}s`);
          validator.recordState(intentHash, {
            state: 'WITHDRAWN',
            timestamp: new Date(),
            blockNumber: withdrawn.blockNumber,
          });
        }
      }
    }

    return validator.getJourney(intentHash)!;
  }

  // All 6 possible routes between 3 chains
  const allRoutes: TestIntentParams[] = [
    { sourceChain: 'optimism', destinationChain: 'base', amount: '100000' },
    { sourceChain: 'optimism', destinationChain: 'arbitrum', amount: '100000' },
    { sourceChain: 'base', destinationChain: 'optimism', amount: '100000' },
    { sourceChain: 'base', destinationChain: 'arbitrum', amount: '100000' },
    { sourceChain: 'arbitrum', destinationChain: 'optimism', amount: '100000' },
    { sourceChain: 'arbitrum', destinationChain: 'base', amount: '100000' },
  ];

  it.each(allRoutes)(
    'should complete $sourceChain → $destinationChain lifecycle',
    async (params) => {
      const journey = await executeLifecycle(params);
      reporter.addJourney(journey);

      expect(journey.isComplete).toBe(true);
      expect(journey.currentState).toBe('WITHDRAWN');
    },
    600000 // 10 minute timeout per route
  );

  it('should execute all 6 routes in parallel', async () => {
    console.log(`Executing ${allRoutes.length} routes in parallel...`);

    const promises = allRoutes.map((data) => executeLifecycle(data));
    const results = await Promise.allSettled(promises);

    // Add all journeys to reporter
    for (const result of results) {
      if (result.status === 'fulfilled') {
        reporter.addJourney(result.value);
      } else {
        console.error('Intent failed:', result.reason);
      }
    }

    const succeeded = results.filter(
      (r) => r.status === 'fulfilled' && r.value.currentState === 'WITHDRAWN'
    );

    console.log(`${succeeded.length}/${allRoutes.length} routes completed successfully`);

    expect(succeeded.length).toBe(allRoutes.length);
  }, 3600000); // 60 minute timeout for all routes
});
