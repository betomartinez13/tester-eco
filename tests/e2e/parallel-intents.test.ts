import { EventMonitor } from '../../src/services/event-monitor.js';
import { StateValidator } from '../../src/services/state-validator.js';
import { IntentReporter } from '../../src/reporters/intent-reporter.js';
import { IntentPublisher } from '../../src/services/intent-publisher.js';
import { SolverClient, isQuoteSuccess } from '../../src/clients/solver-client.js';
import { getConfig } from '../../src/config/index.js';
import { privateKeyToAccount } from 'viem/accounts';
import { getChainId, type SupportedChainName } from '../../src/config/chains.js';
import type { IntentData, IntentJourney, QuoteData } from '../../src/types/intent.js';
import type { Address, Hex } from 'viem';

// Token addresses for USDC on each chain
const USDC_ADDRESSES: Record<SupportedChainName, Address> = {
  optimism: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  solana: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' as Address, // SPL USDC
};

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

  beforeAll(() => {
    publisher = new IntentPublisher();
    monitor = new EventMonitor();
    validator = new StateValidator();
    reporter = new IntentReporter();
    solverClient = new SolverClient();

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
      sourceChainID: getChainId(params.sourceChain),
      destinationChainID: getChainId(params.destinationChain),
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
