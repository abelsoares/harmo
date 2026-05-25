import type { RawEnvelope } from '@harmo/common';
import type { Knex } from 'knex';
import type { NormalizeResult } from '../dispatch';
import { normalizeAppleCorrelation } from './correlation';
import { normalizeAppleRecord } from './record';
import { normalizeAppleWorkout } from './workout';

export * from './device';
export * from './parser';
export * from './skim';
export * from './timestamp';

export async function normalizeAppleEnvelope(knex: Knex, envelope: RawEnvelope): Promise<NormalizeResult> {
  switch (envelope.payload.kind) {
    case 'Record':
      return normalizeAppleRecord(knex, envelope);
    case 'Workout':
      return normalizeAppleWorkout(knex, envelope);
    case 'Correlation':
      return normalizeAppleCorrelation(knex, envelope);
    case 'ActivitySummary':
      return { kind: 'quarantine', reason: 'pre_aggregated', context: { kind: 'ActivitySummary' } };
    case 'Me':
    case 'ExportDate':
      // Informational envelopes — emitted by the parser for completeness but not normalizable.
      // Capture for forensic value (e.g. derive export date / subject DOB later) without flagging.
      return { kind: 'quarantine', reason: 'informational', context: { kind: envelope.payload.kind } };
    default:
      return { kind: 'quarantine', reason: 'unknown_element', context: { kind: envelope.payload.kind } };
  }
}

export { normalizeAppleCorrelation, normalizeAppleRecord, normalizeAppleWorkout };
