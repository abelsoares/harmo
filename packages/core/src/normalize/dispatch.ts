import type {
  CanonicalCorrelationSeed,
  CanonicalSampleSeed,
  CanonicalSource,
  CanonicalWorkoutSeed,
  RawEnvelope
} from '@harmo/common';
import type { Knex } from 'knex';
import { normalizeAppleEnvelope } from './apple';

export type NormalizeResult =
  | { kind: 'sample'; sample: CanonicalSampleSeed; source: CanonicalSource }
  | { kind: 'workout'; workout: CanonicalWorkoutSeed; source: CanonicalSource }
  | { kind: 'correlation'; correlation: CanonicalCorrelationSeed; source: CanonicalSource }
  | { kind: 'quarantine'; reason: string; context?: Record<string, unknown> };

export async function dispatchNormalize(knex: Knex, envelope: RawEnvelope): Promise<NormalizeResult> {
  if (envelope.vendor === 'apple') {
    return normalizeAppleEnvelope(knex, envelope);
  }

  return { kind: 'quarantine', reason: 'unknown_vendor', context: { vendor: envelope.vendor } };
}
