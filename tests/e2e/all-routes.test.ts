import { EventMonitor } from '../../src/services/event-monitor.js';
import { StateValidator } from '../../src/services/state-validator.js';
import { IntentReporter } from '../../src/reporters/intent-reporter.js';
import { IntentPublisher } from '../../src/services/intent-publisher.js';
import { SolverClient, isQuoteSuccess, type BlockchainChain } from '../../src/clients/solver-client.js';
import { getConfig } from '../../src/config/index.js';
import { privateKeyToAccount } from 'viem/accounts';
import { type SupportedChainName } from '../../src/config/chains.js';
import { getSolanaKeypair } from '../../src/clients/svm-client.js';
import { extractUsdcAddresses, getSupportedChainNames, mapChainName } from '../../src/utils/chain-utils.js';
import { BalanceTracker, extractSolverWallets } from '../../src/utils/balance-tracker.js';
import type { Address, Hex } from 'viem';
import type { IntentData, IntentJourney, QuoteData } from '../../src/types/intent.js';

interface TestRouteParams {
  sourceChain: SupportedChainName;
  destinationChain: SupportedChainName;
  amount: string;
}

// Skip E2E tests unless explicitly enabled with RUN_E2E=true
const runE2E = process.env.RUN_E2E === 'true';
const describeE2E = runE2E ? describe : describe.skip;

// Dynamically fetch chains and generate routes from solver API
let USDC_ADDRESSES: Record<SupportedChainName, Address> = {} as Record<SupportedChainName, Address>;
let CHAIN_IDS: Record<SupportedChainName, number> = {} as Record<SupportedChainName, number>;
let SOLVER_WALLETS: Record<SupportedChainName, { basic: string; kernel?: string }> = {} as Record<SupportedChainName, { basic: string; kernel?: string }>;
let allRoutes: TestRouteParams[] = [];
let chainsData: BlockchainChain[] = [];

if (runE2E) {
  const solverClient = new SolverClient();
  chainsData = await solverClient.getBlockchainChains();
  const chainNames = getSupportedChainNames(chainsData);
  USDC_ADDRESSES = extractUsdcAddresses(chainsData);
  SOLVER_WALLETS = extractSolverWallets(chainsData);

  // Build chain ID map from API response
  for (const chain of chainsData) {
    const name = mapChainName(chain.chainName);
    if (name) {
      CHAIN_IDS[name] = chain.chainId;
    }
  }

  // Only include chains that have USDC
  const chainsWithUsdc = chainNames.filter(name => USDC_ADDRESSES[name]);

  console.log(`Fetched ${chainsData.length} chains from solver API: ${chainsData.map(c => c.chainName).join(', ')}`);
  console.log(`Chains with USDC: ${chainsWithUsdc.join(', ')}`);
  console.log(`Solver wallets loaded for: ${Object.keys(SOLVER_WALLETS).join(', ')}`);

  // Generate all route permutations dynamically (source × destination, excluding same chain)
  for (const source of chainsWithUsdc) {
    for (const dest of chainsWithUsdc) {
      if (source !== dest) {
        allRoutes.push({ sourceChain: source, destinationChain: dest, amount: '100000' });
      }
    }
  }

  console.log(`Generated ${allRoutes.length} route permutations dynamically`);
}

describeE2E(`All Cross-Chain Routes (${allRoutes.length} Total)`, () => {
  let publisher: IntentPublisher;
  let monitor: EventMonitor;
  let validator: StateValidator;
  let reporter: IntentReporter;
  let solverClient: SolverClient;
  let balanceTracker: BalanceTracker;
  let evmWalletAddress: string;
  let solanaWalletAddress: string;

  beforeAll(async () => {
    publisher = new IntentPublisher();
    monitor = new EventMonitor();
    validator = new StateValidator();
    reporter = new IntentReporter();
    solverClient = new SolverClient();

    // Initialize balance tracker with solver wallets and USDC addresses from API
    balanceTracker = new BalanceTracker(SOLVER_WALLETS, USDC_ADDRESSES as Record<SupportedChainName, string>);

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

  afterAll(() => {
    reporter.printSummary();
    reporter.saveReport('./reports');
  });

  async function executeLifecycle(params: TestRouteParams): Promise<IntentJourney> {
    console.log(`\n🚀 Starting ${params.sourceChain} → ${params.destinationChain} lifecycle...`);

    const sourceToken = USDC_ADDRESSES[params.sourceChain];
    const destToken = USDC_ADDRESSES[params.destinationChain];

    // Determine funder and recipient based on which chain is Solana
    const isSolanaSource = params.sourceChain === 'solana';
    const isSolanaDestination = params.destinationChain === 'solana';
    const funder = isSolanaSource ? (solanaWalletAddress as Address) : (evmWalletAddress as Address);
    const recipient = isSolanaDestination ? (solanaWalletAddress as Address) : (evmWalletAddress as Address);

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

    // DEBUG: Log what the API returned for Polygon
    if (params.destinationChain === 'polygon' || params.sourceChain === 'polygon') {
      console.log('  📍 API Portal Addresses:');
      console.log('    Source Portal:', quoteResponse.contracts.sourcePortal);
      console.log('    Destination Portal:', quoteResponse.contracts.destinationPortal);
      console.log('    Prover:', quoteResponse.contracts.prover);
    }

    console.log(`  Source Amount: ${quote.sourceAmount} (${(parseInt(quote.sourceAmount) / 1e6).toFixed(2)} USDC)`);
    console.log(`  Destination Amount: ${quote.destinationAmount} (${(parseInt(quote.destinationAmount) / 1e6).toFixed(2)} USDC)`);
    console.log(`  Fee: ${((parseInt(quote.sourceAmount) - parseInt(quote.destinationAmount)) / 1e6).toFixed(5)} USDC`);

    // Take balance snapshots before funding
    const userAddress = isSolanaSource ? solanaWalletAddress : evmWalletAddress;
    const userDestAddress = isSolanaDestination ? solanaWalletAddress : evmWalletAddress;
    await balanceTracker.snapshotBeforeFunding(params.sourceChain, params.destinationChain, userAddress, userDestAddress);

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

    // Verify balance after funding
    const sourceAmount = BigInt(quote.sourceAmount);
    const destAmount = BigInt(quote.destinationAmount);
    await balanceTracker.verifyAfterFunding(params.sourceChain, userAddress, sourceAmount);

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
    console.log(`  Intent Hash: ${intentHash}`);
    console.log(`  Monitoring Portal: ${destinationPortal}`);
    // Adjust polling based on chain - slower chains / rate-limited RPCs need longer intervals
    const destPollInterval = ['ethereum', 'polygon', 'ronin'].includes(params.destinationChain) ? 15000 : 5000;
    const fulfillTimeout = ['ethereum', 'polygon', 'ronin'].includes(params.destinationChain) ? 600000 : 120000;
    const fulfilled = await monitor.waitForFulfilled(
      intentHash,
      params.destinationChain,
      destinationPortal as Address,
      { interval: destPollInterval, timeout: fulfillTimeout }
    );
    expect(fulfilled).not.toBeNull();

    const fulfilledTime = Date.now();
    const fundedToFulfilled = ((fulfilledTime - fundedTime) / 1000).toFixed(1);
    console.log(`✅ Intent ${intentHash.slice(0, 10)}... FULFILLED (${fundedToFulfilled}s)`);
    console.log(`  Block: ${fulfilled!.blockNumber}`);

    // Verify balance after fulfillment (user should receive destAmount)
    await balanceTracker.verifyAfterFulfillment(params.destinationChain, userDestAddress, destAmount);

    validator.recordState(intentHash, {
      state: 'FULFILLED',
      timestamp: new Date(),
      blockNumber: fulfilled!.blockNumber,
    });

    // Step 4: Poll for PROVEN on source chain
    console.log(`⏳ Waiting for proof on ${params.sourceChain}...`);
    const srcPollInterval = ['ethereum', 'polygon', 'ronin'].includes(params.sourceChain) ? 15000 : 5000;
    const provenTimeout = ['ethereum', 'polygon', 'ronin'].includes(params.sourceChain) ? 600000 : 300000;
    const proven = await monitor.pollForProven(
      intentHash,
      params.sourceChain,
      prover as Address,
      { interval: srcPollInterval, timeout: provenTimeout } // 10 min for rate-limited, 5 min for others
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
      { interval: srcPollInterval, timeout: 600000 } // 10 minutes
    );
    expect(withdrawn).not.toBeNull();

    const withdrawnTime = Date.now();
    const provenToWithdrawn = ((withdrawnTime - provenTime) / 1000).toFixed(1);
    const totalTime = ((withdrawnTime - fundedTime) / 1000).toFixed(1);
    console.log(`✅ Intent ${intentHash.slice(0, 10)}... WITHDRAWN (${provenToWithdrawn}s) | Total: ${totalTime}s`);
    console.log(`  Block: ${withdrawn!.blockNumber}`);

    // Verify balance after withdrawal (solver should receive sourceAmount)
    await balanceTracker.verifyAfterWithdrawal(params.sourceChain, sourceAmount);

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
