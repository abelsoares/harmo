import { z } from 'zod';

export const CanonicalWorkoutSeedSchema = z.object({
  subjectId: z.string().min(1),
  activityType: z.string().min(1),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  durationSeconds: z.number().int().nonnegative(),
  externalId: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export type CanonicalWorkoutSeed = z.infer<typeof CanonicalWorkoutSeedSchema>;
