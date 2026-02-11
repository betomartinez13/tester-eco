import { loadConfig } from '../lib/config.js';
import { getPublicClient, getSolanaConnection, SOLANA_CHAIN_ID } from '../lib/clients.js';

export default async function globalSetup(): Promise<void> {
  console.log('\n🔧 Circuit Breaker Global Setup\n');

  // Validate config - will throw if any required env var is missing
  let config;
  try {
    config = loadConfig();
    console.log('✅ Config validated');
    console.log(`   Solver: ${config.solver.url}`);
    console.log(`   Routes file: ${config.routes.file}`);
    console.log(`   Test amount: ${config.test.amount}`);
  } catch (err) {
    console.error('❌ Config validation failed:', err);
    throw err;
  }

  // Verify at least one RPC is configured
  const chainIds = Object.keys(config.rpc.urls);
  if (chainIds.length === 0) {
    throw new Error('CB_RPC_URLS is empty - at least one chain RPC must be configured');
  }
  console.log(`✅ RPC URLs configured for chains: ${chainIds.join(', ')}`);

  // Test connectivity on each configured chain
  for (const chainIdStr of chainIds) {
    const chainId = parseInt(chainIdStr);
    try {
      if (chainId === SOLANA_CHAIN_ID) {
        const connection = getSolanaConnection(config);
        const slot = await connection.getSlot();
        console.log(`✅ Solana connected (slot ${slot})`);
      } else {
        const client = getPublicClient(chainId, config);
        const blockNumber = await client.getBlockNumber();
        console.log(`✅ Chain ${chainId} connected (block ${blockNumber})`);
      }
    } catch (err) {
      console.error(`❌ Chain ${chainId} connection failed:`, err);
      throw err;
    }
  }

  // Verify solver is reachable
  try {
    const res = await fetch(`${config.solver.url}/health`);
    if (!res.ok) throw new Error(`Solver health check returned ${res.status}`);
    console.log(`✅ Solver reachable at ${config.solver.url}`);
  } catch (err) {
    console.error('❌ Solver health check failed:', err);
    throw err;
  }

  console.log('\n✅ Global setup complete\n');
}
