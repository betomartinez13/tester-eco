import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

dotenvConfig();

const ConfigSchema = z.object({
  solverUrl: z.string().url(),
  optimismRpcUrl: z.string().url(),
  baseRpcUrl: z.string().url(),
  arbitrumRpcUrl: z.string().url(),
  solanaRpcUrl: z.string().url().default('https://api.mainnet-beta.solana.com'),
  privateKey: z.string().startsWith('0x').length(66),
  solanaPrivateKey: z.string().optional(), // Base58 format, optional (can use same wallet)
  testAmountUsdc: z.string().default('1000000'),
  testRewardUsdc: z.string().default('100000'),
  pollIntervalMs: z.number().default(5000),
  logLevel: z.string().default('info'),
});

export type Config = z.infer<typeof ConfigSchema>;

let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    _config = ConfigSchema.parse({
      solverUrl: process.env.SOLVER_URL,
      optimismRpcUrl: process.env.OPTIMISM_RPC_URL,
      baseRpcUrl: process.env.BASE_RPC_URL,
      arbitrumRpcUrl: process.env.ARBITRUM_RPC_URL,
      solanaRpcUrl: process.env.SOLANA_RPC_URL,
      privateKey: process.env.PRIVATE_KEY,
      solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY,
      testAmountUsdc: process.env.TEST_AMOUNT_USDC,
      testRewardUsdc: process.env.TEST_REWARD_USDC,
      pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '5000', 10),
      logLevel: process.env.LOG_LEVEL,
    });
  }
  return _config;
}
