import { z } from 'zod';

export const RouteResultSchema = z.object({
  routeKey: z.string(),
  sourceChainId: z.number(),
  destinationChainId: z.number(),
  sourceToken: z.string(),
  destinationToken: z.string(),

  status: z.enum([
    'passed',
    'publish_failed',
    'fulfillment_failed',
    'proving_failed',
    'skipped',
  ]),

  publishDurationMs: z.number().optional(),
  fulfillmentDurationMs: z.number().optional(),
  provingDurationMs: z.number().optional(),
  totalDurationMs: z.number().optional(),

  publishTxHash: z.string().optional(),
  fulfillmentTxHash: z.string().optional(),
  provingTxHash: z.string().optional(),
  intentHash: z.string().optional(),

  error: z.string().optional(),
  errorPhase: z.enum(['publish', 'fulfillment', 'proving']).optional(),
});

export const CircuitBreakerReportSchema = z.object({
  runId: z.string().uuid(),
  timestamp: z.string().datetime(),
  solverUrl: z.string().url(),
  durationMs: z.number().int(),

  summary: z.object({
    totalRoutes: z.number().int(),
    passed: z.number().int(),
    failed: z.number().int(),
    skipped: z.number().int(),
  }),

  routes: z.array(RouteResultSchema),
});

export const AlertPayloadSchema = z.object({
  runId: z.string().uuid(),
  timestamp: z.string().datetime(),
  solverUrl: z.string().url(),

  failedRoutes: z.array(
    z.object({
      routeKey: z.string(),
      sourceChainId: z.number(),
      destinationChainId: z.number(),
      sourceToken: z.string(),
      destinationToken: z.string(),
      status: z.string(),
      error: z.string(),
      errorPhase: z.string(),
      intentHash: z.string().optional(),
    }),
  ),

  summary: z.object({
    totalRoutes: z.number(),
    failed: z.number(),
    passed: z.number(),
  }),
});

export type RouteResult = z.infer<typeof RouteResultSchema>;
export type CircuitBreakerReport = z.infer<typeof CircuitBreakerReportSchema>;
export type AlertPayload = z.infer<typeof AlertPayloadSchema>;
