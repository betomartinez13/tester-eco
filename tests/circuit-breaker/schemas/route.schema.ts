import { z } from 'zod';

export const RouteDefinitionSchema = z.object({
  sourceChainId: z.number().int().positive(),
  destinationChainId: z.number().int().positive(),
  sourceToken: z.string(),
  destinationToken: z.string(),
  proverAddress: z.string(),
});

export type RouteDefinition = z.infer<typeof RouteDefinitionSchema>;

export const RoutesFileSchema = z.array(RouteDefinitionSchema);
