import { CircuitBreakerConfigSchema, type CircuitBreakerConfig } from '../schemas/config.schema.js';

export type { CircuitBreakerConfig };

export function loadConfig(): CircuitBreakerConfig {
  const raw = {
    solver: {
      url: process.env.CB_SOLVER_URL,
    },
    routes: {
      file: process.env.CB_ROUTES_FILE,
    },
    wallet: {
      privateKey: process.env.CB_WALLET_PRIVATE_KEY,
      recipientAddress: process.env.CB_WALLET_RECIPIENT,
    },
    test: {
      amount: process.env.CB_TEST_AMOUNT,
      publishConcurrency: process.env.CB_PUBLISH_CONCURRENCY,
    },
    timeouts: {
      publishMs: process.env.CB_TIMEOUT_PUBLISH_MS,
      fulfillmentWaitMs: process.env.CB_TIMEOUT_FULFILLMENT_WAIT_MS,
      fulfillmentVerifyMs: process.env.CB_TIMEOUT_FULFILLMENT_VERIFY_MS,
      provingWaitMs: process.env.CB_TIMEOUT_PROVING_WAIT_MS,
      provingVerifyMs: process.env.CB_TIMEOUT_PROVING_VERIFY_MS,
    },
    polling: {
      initialIntervalMs: process.env.CB_POLL_INITIAL_MS,
      multiplier: process.env.CB_POLL_MULTIPLIER,
      maxIntervalMs: process.env.CB_POLL_MAX_MS,
    },
    reporting: {
      reportPath: process.env.CB_REPORT_PATH,
      alertEndpoint: process.env.CB_ALERT_ENDPOINT,
      alertAuthHeader: process.env.CB_ALERT_AUTH_HEADER,
    },
    rpc: {
      urls: JSON.parse(process.env.CB_RPC_URLS ?? '{}'),
    },
    chainOverrides: JSON.parse(process.env.CB_CHAIN_OVERRIDES ?? '{}'),
  };

  return CircuitBreakerConfigSchema.parse(raw);
}
