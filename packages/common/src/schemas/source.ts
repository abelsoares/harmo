import { z } from 'zod';

export const CanonicalSourceSchema = z.object({
  subjectId: z.string().min(1),
  vendor: z.string().min(1),
  sourceName: z.string().min(1),
  manufacturer: z.string().nullable(),
  hardwareVersion: z.string().nullable(),
  softwareVersion: z.string().nullable(),
  productType: z.string().nullable(),
  identityHash: z.string().length(64)
});

export type CanonicalSource = z.infer<typeof CanonicalSourceSchema>;
