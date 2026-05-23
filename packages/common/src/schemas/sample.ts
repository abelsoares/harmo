import { z } from 'zod';

export const CanonicalSampleSchema = z.object({
  subjectId: z.string().min(1),
  metric: z.string().min(1),
  valueNum: z.number().nullable(),
  valueText: z.string().nullable(),
  unit: z.string().nullable(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  startOffsetMinutes: z.number().int().min(-720).max(840).nullable(),
  sourceId: z.bigint(),
  workoutId: z.bigint().nullable(),
  correlationId: z.bigint().nullable(),
  externalId: z.string().min(1),
  registryVersion: z.number().int().positive(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export type CanonicalSample = z.infer<typeof CanonicalSampleSchema>;

// A normalized sample minus its sourceId. The normalizer doesn't know the source's row id yet —
// US-7's upsertSource fills it in inside the worker before ingestCanonical writes the row.
export const CanonicalSampleSeedSchema = CanonicalSampleSchema.omit({ sourceId: true });

export type CanonicalSampleSeed = z.infer<typeof CanonicalSampleSeedSchema>;

export const APPLE_TOP_LEVEL_KINDS = [
  'Record',
  'Workout',
  'Correlation',
  'ActivitySummary',
  'ClinicalRecord',
  'Audiogram',
  'VisionPrescription',
  'Me',
  'ExportDate'
] as const;

export type AppleTopLevelKind = (typeof APPLE_TOP_LEVEL_KINDS)[number];

export const ChildNodeSchema: z.ZodType<ChildNode> = z.lazy(() =>
  z.object({
    name: z.string().min(1),
    attrs: z.record(z.string(), z.string()).default({}),
    metadata: z.record(z.string(), z.string()).default({}),
    children: z.array(ChildNodeSchema).default([])
  })
);

export type ChildNode = {
  name: string;
  attrs: Record<string, string>;
  metadata: Record<string, string>;
  children: ChildNode[];
};

export const RawApplePayloadSchema = z.object({
  kind: z.enum(APPLE_TOP_LEVEL_KINDS),
  attrs: z.record(z.string(), z.string()).default({}),
  metadata: z.record(z.string(), z.string()).default({}),
  children: z.array(ChildNodeSchema).default([])
});

export type RawApplePayload = z.infer<typeof RawApplePayloadSchema>;

export const RawEnvelopeSchema = z.object({
  vendor: z.string().min(1),
  batchId: z.string().min(1),
  payload: RawApplePayloadSchema
});

export type RawEnvelope = z.infer<typeof RawEnvelopeSchema>;
