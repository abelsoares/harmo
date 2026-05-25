import { z } from 'zod';

export const CanonicalCorrelationSeedSchema = z.object({
  subjectId: z.string().min(1),
  metric: z.string().min(1),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  externalId: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export type CanonicalCorrelationSeed = z.infer<typeof CanonicalCorrelationSeedSchema>;
