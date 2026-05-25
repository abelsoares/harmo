import type { ChildNode, RawEnvelope } from '@harmo/common';
import { getKnex } from '@src/clients';
import { normalizeAppleWorkout } from '@src/normalize/apple/workout';
import { describe, expect, it } from 'vitest';

function appleWorkoutEnvelope(
  attrs: Record<string, string>,
  metadata: Record<string, string> = {},
  children: ChildNode[] = []
): RawEnvelope {
  return {
    vendor: 'apple',
    batchId: 'test-batch',
    payload: { kind: 'Workout', attrs, metadata, children }
  };
}

describe('normalizeAppleWorkout', () => {
  it('normalizes a Strava running workout', async () => {
    const knex = getKnex();
    const result = await normalizeAppleWorkout(
      knex,
      appleWorkoutEnvelope(
        {
          workoutActivityType: 'HKWorkoutActivityTypeRunning',
          duration: '30.4',
          durationUnit: 'min',
          sourceName: 'Strava',
          sourceVersion: '45816',
          creationDate: '2024-12-30 22:36:38 +0100',
          startDate: '2024-12-28 08:40:14 +0100',
          endDate: '2024-12-28 09:10:39 +0100',
          totalDistance: '5.0528',
          totalDistanceUnit: 'km',
          totalEnergyBurned: '528.152',
          totalEnergyBurnedUnit: 'kcal'
        },
        { HKIndoorWorkout: '0', HKExternalUUID: 'strava://activities/13205603309' }
      )
    );

    expect(result.kind).toBe('workout');

    if (result.kind !== 'workout') {
      throw new Error('expected workout');
    }

    expect(result.workout.activityType).toBe('running');
    expect(result.workout.externalId).toBe('strava://activities/13205603309');
    expect(result.workout.startTime.toISOString()).toBe('2024-12-28T07:40:14.000Z');
    expect(result.workout.endTime.toISOString()).toBe('2024-12-28T08:10:39.000Z');
    expect(result.workout.durationSeconds).toBe(30 * 60 + 25);
    expect(result.workout.metadata).toMatchObject({
      rawActivityType: 'HKWorkoutActivityTypeRunning',
      HKIndoorWorkout: '0',
      startOffsetMinutes: 60
    });
    expect((result.workout.metadata.apple as Record<string, unknown>).totalDistance).toBe('5.0528');
    expect(result.source.vendor).toBe('apple');
    expect(result.source.sourceName).toBe('Strava');
    expect(result.source.softwareVersion).toBe('45816');
  });

  it('parses HKDevice into source provenance for watch workouts', async () => {
    const knex = getKnex();
    const result = await normalizeAppleWorkout(
      knex,
      appleWorkoutEnvelope({
        workoutActivityType: 'HKWorkoutActivityTypeRunning',
        sourceName: "Abel's Apple Watch",
        sourceVersion: '11.1',
        device:
          '<<HKDevice: 0x7760935a0>, name:Apple Watch, manufacturer:Apple Inc., model:Watch, hardware:Watch7,9, software:11.1, creation date:2024-11-05 01:52:07 +0000>',
        startDate: '2024-12-30 19:04:54 +0100',
        endDate: '2024-12-30 19:06:02 +0100'
      })
    );

    if (result.kind !== 'workout') {
      throw new Error('expected workout');
    }

    expect(result.source.manufacturer).toBe('Apple Inc.');
    expect(result.source.hardwareVersion).toBe('Watch7,9');
    expect(result.source.productType).toBe('Watch');
  });

  it('preserves non-MetadataEntry children verbatim under metadata.children', async () => {
    const knex = getKnex();
    const statsChild: ChildNode = {
      name: 'WorkoutStatistics',
      attrs: {
        type: 'HKQuantityTypeIdentifierActiveEnergyBurned',
        sum: '528.152',
        unit: 'kcal'
      },
      metadata: {},
      children: []
    };
    const routeChild: ChildNode = {
      name: 'WorkoutRoute',
      attrs: { sourceName: 'Strava' },
      metadata: {},
      children: [
        {
          name: 'FileReference',
          attrs: { path: '/workout-routes/route_2024-12-30_9.36pm.gpx' },
          metadata: {},
          children: []
        }
      ]
    };

    const result = await normalizeAppleWorkout(
      knex,
      appleWorkoutEnvelope(
        {
          workoutActivityType: 'HKWorkoutActivityTypeRunning',
          sourceName: 'Strava',
          startDate: '2024-12-28 08:40:14 +0100',
          endDate: '2024-12-28 09:10:39 +0100'
        },
        {},
        [statsChild, routeChild]
      )
    );

    if (result.kind !== 'workout') {
      throw new Error('expected workout');
    }

    const children = result.workout.metadata.children as ChildNode[];

    expect(children).toHaveLength(2);
    expect(children[0].name).toBe('WorkoutStatistics');
    expect(children[1].name).toBe('WorkoutRoute');
    expect(children[1].children[0].attrs.path).toBe('/workout-routes/route_2024-12-30_9.36pm.gpx');
  });

  it('falls back to HKMetadataKeySyncIdentifier for external_id', async () => {
    const knex = getKnex();
    const result = await normalizeAppleWorkout(
      knex,
      appleWorkoutEnvelope(
        {
          workoutActivityType: 'HKWorkoutActivityTypeCycling',
          sourceName: 'Strava',
          startDate: '2024-06-01 09:00:00 +0100',
          endDate: '2024-06-01 09:30:00 +0100'
        },
        { HKMetadataKeySyncIdentifier: 'sync-abc-123' }
      )
    );

    if (result.kind !== 'workout') {
      throw new Error('expected workout');
    }

    expect(result.workout.externalId).toBe('sync-abc-123');
    expect(result.workout.activityType).toBe('cycling');
  });

  it('synthesizes a deterministic external_id when none is provided', async () => {
    const knex = getKnex();
    const env = appleWorkoutEnvelope({
      workoutActivityType: 'HKWorkoutActivityTypeCrossTraining',
      sourceName: 'Tabata',
      startDate: '2021-03-02 20:31:50 +0100',
      endDate: '2021-03-02 20:39:57 +0100'
    });

    const a = await normalizeAppleWorkout(knex, env);
    const b = await normalizeAppleWorkout(knex, env);

    if (a.kind !== 'workout' || b.kind !== 'workout') {
      throw new Error('expected workouts');
    }

    expect(a.workout.externalId).toBe(b.workout.externalId);
    expect(a.workout.externalId).toMatch(/^[a-f0-9]{64}$/);
  });

  it('canonicalizes known activity types via the inline map', async () => {
    const knex = getKnex();

    for (const [raw, expected] of [
      ['HKWorkoutActivityTypeRunning', 'running'],
      ['HKWorkoutActivityTypeCrossTraining', 'cross_training'],
      ['HKWorkoutActivityTypeHighIntensityIntervalTraining', 'hiit'],
      ['HKWorkoutActivityTypeFunctionalStrengthTraining', 'strength_training']
    ] as const) {
      const result = await normalizeAppleWorkout(
        knex,
        appleWorkoutEnvelope({
          workoutActivityType: raw,
          sourceName: 'Test',
          startDate: '2024-01-01 00:00:00 +0000',
          endDate: '2024-01-01 00:01:00 +0000'
        })
      );

      if (result.kind !== 'workout') {
        throw new Error('expected workout');
      }

      expect(result.workout.activityType, raw).toBe(expected);
    }
  });

  it('falls back to snake_case stripping for unknown activity types', async () => {
    const knex = getKnex();
    const result = await normalizeAppleWorkout(
      knex,
      appleWorkoutEnvelope({
        workoutActivityType: 'HKWorkoutActivityTypeKayaking',
        sourceName: 'Test',
        startDate: '2024-01-01 00:00:00 +0000',
        endDate: '2024-01-01 00:01:00 +0000'
      })
    );

    if (result.kind !== 'workout') {
      throw new Error('expected workout');
    }

    expect(result.workout.activityType).toBe('kayaking');
    expect(result.workout.metadata.rawActivityType).toBe('HKWorkoutActivityTypeKayaking');
  });

  it('computes durationSeconds from start/end (ignoring the duration attribute)', async () => {
    const knex = getKnex();
    const result = await normalizeAppleWorkout(
      knex,
      appleWorkoutEnvelope({
        workoutActivityType: 'HKWorkoutActivityTypeRunning',
        // Apple reports duration="30.4" in minutes; we compute from timestamps instead.
        duration: '30.4',
        durationUnit: 'min',
        sourceName: 'Test',
        startDate: '2024-01-01 10:00:00 +0000',
        endDate: '2024-01-01 10:30:25 +0000'
      })
    );

    if (result.kind !== 'workout') {
      throw new Error('expected workout');
    }

    expect(result.workout.durationSeconds).toBe(30 * 60 + 25);
  });

  it('quarantines envelopes that arrive at the wrong handler', async () => {
    const knex = getKnex();
    const result = await normalizeAppleWorkout(knex, {
      vendor: 'apple',
      batchId: 't',
      payload: { kind: 'Record', attrs: {}, metadata: {}, children: [] }
    });

    expect(result.kind).toBe('quarantine');
    if (result.kind === 'quarantine') {
      expect(result.reason).toBe('wrong_handler');
    }
  });

  it('quarantines workouts missing workoutActivityType', async () => {
    const knex = getKnex();
    const result = await normalizeAppleWorkout(
      knex,
      appleWorkoutEnvelope({
        sourceName: 'Test',
        startDate: '2024-01-01 00:00:00 +0000',
        endDate: '2024-01-01 00:01:00 +0000'
      })
    );

    expect(result.kind).toBe('quarantine');
    if (result.kind === 'quarantine') {
      expect(result.reason).toBe('missing_activity_type');
    }
  });

  it('quarantines workouts with end before start', async () => {
    const knex = getKnex();
    const result = await normalizeAppleWorkout(
      knex,
      appleWorkoutEnvelope({
        workoutActivityType: 'HKWorkoutActivityTypeRunning',
        sourceName: 'Test',
        startDate: '2024-01-01 10:00:00 +0000',
        endDate: '2024-01-01 09:00:00 +0000'
      })
    );

    expect(result.kind).toBe('quarantine');
    if (result.kind === 'quarantine') {
      expect(result.reason).toBe('invalid_duration');
    }
  });
});
