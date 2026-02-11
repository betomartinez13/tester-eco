import { z } from 'zod';

export const CircuitBreakerConfigSchema = z.object({
  solver: z.object({
    url: z.string().url(),
  }),

  routes: z.object({
    file: z.string(),
  }),

  wallet: z.object({
    privateKey: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    recipientAddress: z.string(),
  }),

  test: z.object({
    amount: z.string().default('0.01'),
    publishConcurrency: z.coerce.number().int().positive().default(3),
  }),

  timeouts: z.object({
    publishMs: z.coerce.number().int().positive().default(60_000),
    fulfillmentWaitMs: z.coerce.number().int().positive().default(60_000),
    fulfillmentVerifyMs: z.coerce.number().int().positive().default(120_000),
    provingWaitMs: z.coerce.number().int().positive().default(30_000),
    provingVerifyMs: z.coerce.number().int().positive().default(300_000),
  }),

  polling: z.object({
    initialIntervalMs: z.coerce.number().int().positive().default(2_000),
    multiplier: z.coerce.number().positive().default(1.5),
    maxIntervalMs: z.coerce.number().int().positive().default(10_000),
  }),

  reporting: z.object({
    reportPath: z.string().default('./circuit-breaker-reports'),
    alertEndpoint: z.string().url().optional(),
    alertAuthHeader: z.string().optional(),
  }),

  rpc: z.object({
    urls: z.record(z.string(), z.string()),
  }),

  chainOverrides: z
    .record(
      z.string(),
      z.object({
        portalAddress: z.string(),
      }),
    )
    .default({}),
});

export type CircuitBreakerConfig = z.infer<typeof CircuitBreakerConfigSchema>;
