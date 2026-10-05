import { z } from 'zod';

export const API_VERSION = 'v1' as const;
export const SUPPORTED_SCHEMA_VERSIONS = [1] as const;

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string().min(1),
  version: z.string().min(1),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
