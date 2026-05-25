import { createHash } from 'node:crypto';
import type { CanonicalCorrelationSeed, CanonicalSource, RawEnvelope } from '@harmo/common';
import { DEFAULT_SUBJECT_ID } from '@harmo/common';
import { computeSourceIdentityHash } from '@src/ingest/source-cache';
import type { Knex } from 'knex';
import type { NormalizeResult } from '../dispatch';
import { parseAppleDevice } from './device';
import { parseAppleTimestamp } from './timestamp';

// Apple HKCorrelationTypeIdentifier → canonical correlation metric. Inline for v0;
// promotable to the registry later if we grow per-correlation behavior.
const APPLE_CORRELATION_MAP: Record<string, string> = {
  HKCorrelationTypeIdentifierBloodPressure: 'blood_pressure',
  HKCorrelationTypeIdentifierFood: 'food'
};

function canonicalCorrelationMetric(raw: string): string {
  const known = APPLE_CORRELATION_MAP[raw];

  if (known) {
    return known;
  }

  const stripped = raw.replace(/^HKCorrelationTypeIdentifier/, '');

  if (!stripped) {
    return 'unknown';
  }

  return stripped[0].toLowerCase() + stripped.slice(1).replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
}

function quarantine(reason: string, context: Record<string, unknown> = {}): NormalizeResult {
  return { kind: 'quarantine', reason, context };
}

function syntheticExternalId(parts: {
  rawType: string;
  sourceName: string;
  startDate: string;
  endDate: string;
}): string {
  const input = ['apple', 'correlation', parts.rawType, parts.sourceName, parts.startDate, parts.endDate].join('|');

  return createHash('sha256').update(input).digest('hex');
}

export async function normalizeAppleCorrelation(_knex: Knex, envelope: RawEnvelope): Promise<NormalizeResult> {
  const payload = envelope.payload;

  if (payload.kind !== 'Correlation') {
    return quarantine('wrong_handler', { kind: payload.kind });
  }

  const subjectId = DEFAULT_SUBJECT_ID;
  const rawType = payload.attrs.type;
  const sourceName = payload.attrs.sourceName;
  const startDateStr = payload.attrs.startDate;
  const endDateStr = payload.attrs.endDate;

  if (!rawType) {
    return quarantine('missing_type');
  }

  if (!sourceName) {
    return quarantine('missing_source_name');
  }

  if (!startDateStr || !endDateStr) {
    return quarantine('missing_dates');
  }

  let startTs: { utc: Date; offsetMinutes: number };
  let endTs: { utc: Date; offsetMinutes: number };

  try {
    startTs = parseAppleTimestamp(startDateStr);
    endTs = parseAppleTimestamp(endDateStr);
  } catch (err) {
    return quarantine('invalid_timestamp', { error: String(err) });
  }

  const externalId =
    payload.metadata.HKExternalUUID ??
    payload.metadata.HKMetadataKeySyncIdentifier ??
    syntheticExternalId({ rawType, sourceName, startDate: startDateStr, endDate: endDateStr });

  const device = parseAppleDevice(payload.attrs.device);
  const identityHash = computeSourceIdentityHash({
    vendor: 'apple',
    sourceName,
    hardwareVersion: device?.hardware ?? null,
    productType: device?.model ?? null
  });

  const source: CanonicalSource = {
    subjectId,
    vendor: 'apple',
    sourceName,
    manufacturer: device?.manufacturer ?? null,
    hardwareVersion: device?.hardware ?? null,
    softwareVersion: payload.attrs.sourceVersion ?? null,
    productType: device?.model ?? null,
    identityHash
  };

  const correlation: CanonicalCorrelationSeed = {
    subjectId,
    metric: canonicalCorrelationMetric(rawType),
    startTime: startTs.utc,
    endTime: endTs.utc,
    externalId,
    metadata: {
      ...payload.metadata,
      rawType,
      startOffsetMinutes: startTs.offsetMinutes,
      endOffsetMinutes: endTs.offsetMinutes,
      apple: {
        creationDate: payload.attrs.creationDate ?? null,
        sourceVersion: payload.attrs.sourceVersion ?? null
      }
    }
  };

  return { kind: 'correlation', correlation, source };
}
