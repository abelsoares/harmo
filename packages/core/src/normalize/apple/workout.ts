import { createHash } from 'node:crypto';
import type { CanonicalSource, CanonicalWorkoutSeed, RawEnvelope } from '@harmo/common';
import { DEFAULT_SUBJECT_ID } from '@harmo/common';
import { computeSourceIdentityHash } from '@src/ingest/source-cache';
import type { Knex } from 'knex';
import type { NormalizeResult } from '../dispatch';
import { parseAppleDevice } from './device';
import { parseAppleTimestamp } from './timestamp';

// Apple HKWorkoutActivityType → canonical activity. Inline for v0; can be promoted to the
// registry table later if we grow per-activity behavior (e.g. metric aliasing per sport).
const APPLE_ACTIVITY_MAP: Record<string, string> = {
  HKWorkoutActivityTypeRunning: 'running',
  HKWorkoutActivityTypeWalking: 'walking',
  HKWorkoutActivityTypeCycling: 'cycling',
  HKWorkoutActivityTypeSwimming: 'swimming',
  HKWorkoutActivityTypeYoga: 'yoga',
  HKWorkoutActivityTypeFunctionalStrengthTraining: 'strength_training',
  HKWorkoutActivityTypeTraditionalStrengthTraining: 'strength_training',
  HKWorkoutActivityTypeCrossTraining: 'cross_training',
  HKWorkoutActivityTypeHighIntensityIntervalTraining: 'hiit',
  HKWorkoutActivityTypeHiking: 'hiking',
  HKWorkoutActivityTypeRowing: 'rowing',
  HKWorkoutActivityTypeElliptical: 'elliptical',
  HKWorkoutActivityTypeStairClimbing: 'stair_climbing',
  HKWorkoutActivityTypeJumpRope: 'jump_rope',
  HKWorkoutActivityTypeFlexibility: 'flexibility',
  HKWorkoutActivityTypeMixedCardio: 'mixed_cardio',
  HKWorkoutActivityTypePilates: 'pilates',
  HKWorkoutActivityTypeBoxing: 'boxing',
  HKWorkoutActivityTypeOther: 'other'
};

function canonicalActivityType(raw: string): string {
  const known = APPLE_ACTIVITY_MAP[raw];

  if (known) {
    return known;
  }

  const stripped = raw.replace(/^HKWorkoutActivityType/, '');

  if (!stripped) {
    return 'unknown';
  }

  return stripped[0].toLowerCase() + stripped.slice(1).replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
}

function quarantine(reason: string, context: Record<string, unknown> = {}): NormalizeResult {
  return { kind: 'quarantine', reason, context };
}

function syntheticExternalId(parts: {
  rawActivityType: string;
  sourceName: string;
  startDate: string;
  endDate: string;
}): string {
  const input = ['apple', 'workout', parts.rawActivityType, parts.sourceName, parts.startDate, parts.endDate].join('|');

  return createHash('sha256').update(input).digest('hex');
}

export async function normalizeAppleWorkout(_knex: Knex, envelope: RawEnvelope): Promise<NormalizeResult> {
  const payload = envelope.payload;

  if (payload.kind !== 'Workout') {
    return quarantine('wrong_handler', { kind: payload.kind });
  }

  const subjectId = DEFAULT_SUBJECT_ID;
  const rawActivityType = payload.attrs.workoutActivityType;
  const sourceName = payload.attrs.sourceName;
  const startDateStr = payload.attrs.startDate;
  const endDateStr = payload.attrs.endDate;

  if (!rawActivityType) {
    return quarantine('missing_activity_type');
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

  const durationSeconds = Math.round((endTs.utc.getTime() - startTs.utc.getTime()) / 1000);

  if (durationSeconds < 0) {
    return quarantine('invalid_duration', { startDate: startDateStr, endDate: endDateStr });
  }

  const externalId =
    payload.metadata.HKExternalUUID ??
    payload.metadata.HKMetadataKeySyncIdentifier ??
    syntheticExternalId({ rawActivityType, sourceName, startDate: startDateStr, endDate: endDateStr });

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

  const workout: CanonicalWorkoutSeed = {
    subjectId,
    activityType: canonicalActivityType(rawActivityType),
    startTime: startTs.utc,
    endTime: endTs.utc,
    durationSeconds,
    externalId,
    metadata: {
      ...payload.metadata,
      rawActivityType,
      startOffsetMinutes: startTs.offsetMinutes,
      endOffsetMinutes: endTs.offsetMinutes,
      apple: {
        duration: payload.attrs.duration ?? null,
        durationUnit: payload.attrs.durationUnit ?? null,
        totalDistance: payload.attrs.totalDistance ?? null,
        totalDistanceUnit: payload.attrs.totalDistanceUnit ?? null,
        totalEnergyBurned: payload.attrs.totalEnergyBurned ?? null,
        totalEnergyBurnedUnit: payload.attrs.totalEnergyBurnedUnit ?? null,
        creationDate: payload.attrs.creationDate ?? null
      },
      children: payload.children
    }
  };

  return { kind: 'workout', workout, source };
}
