import { createHash } from 'node:crypto';
import type { CanonicalSampleSeed, CanonicalSource, RawEnvelope } from '@harmo/common';
import { DEFAULT_SUBJECT_ID } from '@harmo/common';
import { computeSourceIdentityHash } from '@src/ingest/source-cache';
import { convertUnit, findMetricByAlias, findUnitConversion } from '@src/registry/lookup';
import type { Knex } from 'knex';
import type { NormalizeResult } from '../dispatch';
import { parseAppleDevice } from './device';
import { parseAppleTimestamp } from './timestamp';

function quarantine(reason: string, context: Record<string, unknown> = {}): NormalizeResult {
  return { kind: 'quarantine', reason, context };
}

function syntheticExternalId(parts: {
  appleType: string;
  sourceName: string;
  startDate: string;
  endDate: string;
  value: string;
}): string {
  const input = ['apple', parts.appleType, parts.sourceName, parts.startDate, parts.endDate, parts.value].join('|');

  return createHash('sha256').update(input).digest('hex');
}

export async function normalizeAppleRecord(knex: Knex, envelope: RawEnvelope): Promise<NormalizeResult> {
  const payload = envelope.payload;

  if (payload.kind !== 'Record') {
    return quarantine('wrong_handler', { kind: payload.kind });
  }

  const subjectId = DEFAULT_SUBJECT_ID;
  const appleType = payload.attrs.type;
  const sourceName = payload.attrs.sourceName;
  const startDateStr = payload.attrs.startDate;
  const endDateStr = payload.attrs.endDate;

  if (!appleType) {
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

  const metric = await findMetricByAlias(knex, 'apple', appleType);

  if (!metric) {
    return quarantine('unknown_alias', { alias: appleType });
  }

  const rawValue = payload.attrs.value;
  let valueNum: number | null = null;
  let valueText: string | null = null;

  if (metric.value_kind === 'quantity') {
    if (rawValue === undefined || rawValue === '') {
      return quarantine('missing_value', { metric: metric.metric });
    }

    const numericValue = Number(rawValue);

    if (!Number.isFinite(numericValue)) {
      return quarantine('invalid_value', { value: rawValue });
    }

    const canonicalUnit = metric.canonical_unit;

    if (!canonicalUnit) {
      return quarantine('metric_missing_canonical_unit', { metric: metric.metric });
    }

    const rawUnit = payload.attrs.unit;

    if (!rawUnit) {
      // Some Records omit unit when it equals the canonical (e.g. synthetic step counts).
      valueNum = numericValue;
    } else {
      const conversion = await findUnitConversion(knex, rawUnit, canonicalUnit);

      if (!conversion) {
        return quarantine('unit_unknown', { fromUnit: rawUnit, toUnit: canonicalUnit });
      }

      valueNum = convertUnit(numericValue, conversion);
    }
  } else {
    if (rawValue === undefined || rawValue === '') {
      return quarantine('missing_value', { metric: metric.metric });
    }

    valueText = rawValue;
  }

  const externalId =
    payload.metadata.HKExternalUUID ??
    payload.metadata.HKMetadataKeySyncIdentifier ??
    syntheticExternalId({
      appleType,
      sourceName,
      startDate: startDateStr,
      endDate: endDateStr,
      value: rawValue ?? ''
    });

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

  const sample: CanonicalSampleSeed = {
    subjectId,
    metric: metric.metric,
    valueNum,
    valueText,
    unit: metric.canonical_unit,
    startTime: startTs.utc,
    endTime: endTs.utc,
    startOffsetMinutes: startTs.offsetMinutes,
    workoutId: null,
    correlationId: null,
    externalId,
    registryVersion: metric.registry_version,
    metadata: { ...payload.metadata }
  };

  return { kind: 'sample', sample, source };
}
