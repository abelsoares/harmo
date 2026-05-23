import type { CanonicalSampleSeed, CanonicalSource, RawEnvelope } from '@harmo/common';
import type { Knex } from 'knex';
import { normalizeAppleEnvelope } from './apple';

export type NormalizeResult =
  | { kind: 'sample'; sample: CanonicalSampleSeed; source: CanonicalSource }
  | { kind: 'workout'; workout: unknown }
  | { kind: 'correlation'; correlation: unknown }
  | { kind: 'quarantine'; reason: string; context?: Record<string, unknown> };

export async function dispatchNormalize(knex: Knex, envelope: RawEnvelope): Promise<NormalizeResult> {
  if (envelope.vendor === 'apple') {
    return normalizeAppleEnvelope(knex, envelope);
  }

  return { kind: 'quarantine', reason: 'unknown_vendor', context: { vendor: envelope.vendor } };
}
