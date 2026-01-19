import { EventMonitor } from '../../src/services/event-monitor.js';
import { StateValidator } from '../../src/services/state-validator.js';
import { IntentReporter } from '../../src/reporters/intent-reporter.js';
import { IntentPublisher } from '../../src/services/intent-publisher.js';
import { getConfig } from '../../src/config/index.js';
import { privateKeyToAccount } from 'viem/accounts';
import type { IntentData, IntentJourney } from '../../src/types/intent.js';
import type { Address } from 'viem';

// Skip E2E tests unless explicitly enabled with RUN_E2E=true
const runE2E = process.env.RUN_E2E === 'true';
const describeE2E = runE2E ? describe : describe.skip;

describeE2E('Parallel Intent Execution', () => {
  let publisher: IntentPublisher;
  let monitor: EventMonitor;
  let validator: StateValidator;
  let reporter: IntentReporter;
  let walletAddress: string;

  beforeAll(() => {
    publisher = new IntentPublisher();
    monitor = new EventMonitor();
    validator = new StateValidator();
    reporter = new IntentReporter();

    const config = getConfig();
    const account = privateKeyToAccount(config.privateKey as `0x${string}`);
    walletAddress = account.address;

    console.log(`Wallet address: ${walletAddress}`);
  });

  afterAll(() => {
    reporter.printSummary();
    reporter.saveReport('./reports');
  });

  async function executeLifecycle(intentData: IntentData): Promise<IntentJourney> {
    console.log(`Starting ${intentData.sourceChain} → ${intentData.destinationChain} lifecycle...`);

    // Publish and fund intent (this also gets contract addresses)
    const {
      intentHash,
      txHash,
      sourcePortal,
      destinationPortal,
      prover,
    } = await publisher.publishAndFund(intentData);

    console.log(`Intent ${intentHash.slice(0, 10)}... published`);

    validator.initializeIntent(intentHash, intentData.sourceChain, intentData.destinationChain);
    validator.recordState(intentHash, { state: 'PUBLISHED', timestamp: new Date(), txHash });
    validator.recordState(intentHash, { state: 'FUNDED', timestamp: new Date(), txHash });

    // Wait for fulfillment on destination chain
    const fulfilled = await monitor.waitForFulfilled(
      intentHash,
      intentData.destinationChain,
      destinationPortal,
      { interval: 5000, timeout: 120000 }
    );

    if (fulfilled) {
      console.log(`Intent ${intentHash.slice(0, 10)}... fulfilled`);
      validator.recordState(intentHash, {
        state: 'FULFILLED',
        timestamp: new Date(),
        blockNumber: fulfilled.blockNumber,
      });

      // Wait for proof on source chain
      const proven = await monitor.pollForProven(
        intentHash,
        intentData.sourceChain,
        prover,
        { interval: 5000, timeout: 180000 }
      );

      if (proven) {
        console.log(`Intent ${intentHash.slice(0, 10)}... proven`);
        validator.recordState(intentHash, {
          state: 'PROVEN',
          timestamp: new Date(),
          blockNumber: proven.blockNumber,
        });

        // Wait for withdrawal on source chain
        const withdrawn = await monitor.pollForWithdrawn(
          intentHash,
          intentData.sourceChain,
          sourcePortal,
          { interval: 5000, timeout: 300000 }
        );

        if (withdrawn) {
          console.log(`Intent ${intentHash.slice(0, 10)}... withdrawn`);
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

  it('should execute multiple intents in parallel', async () => {
    const intents: IntentData[] = [
      {
        sourceChain: 'optimism',
        destinationChain: 'base',
        token: 'USDC',
        amount: '1000000',  // 1 USDC
        reward: '100000',   // 0.1 USDC
      },
      {
        sourceChain: 'optimism',
        destinationChain: 'arbitrum',
        token: 'USDC',
        amount: '1000000',  // 1 USDC
        reward: '100000',   // 0.1 USDC
      },
    ];

    console.log(`Executing ${intents.length} intents in parallel...`);

    const promises = intents.map((data) => executeLifecycle(data));
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

    console.log(`${succeeded.length}/${intents.length} intents completed successfully`);

    expect(succeeded.length).toBe(intents.length);
  }, 600000); // 10 minute timeout
});
