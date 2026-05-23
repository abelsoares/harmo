import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { RawApplePayload } from '@harmo/common';
import { parseAppleExport } from '@src/normalize/apple/parser';
import { describe, expect, it } from 'vitest';

const FIXTURES_DIR = join(__dirname, '../../fixtures/apple');

function fixtureStream(name: string): Readable {
  return createReadStream(join(FIXTURES_DIR, name));
}

function streamOf(xml: string): Readable {
  return Readable.from(Buffer.from(xml, 'utf-8'));
}

async function collect(stream: Readable): Promise<RawApplePayload[]> {
  const out: RawApplePayload[] = [];

  for await (const envelope of parseAppleExport(stream)) {
    out.push(envelope);
  }

  return out;
}

describe('parseAppleExport — fixtures', () => {
  it('emits Correlation envelope without child Records and the standalone duplicates', async () => {
    const envelopes = await collect(fixtureStream('bp-correlation.xml'));

    expect(envelopes.length).toBe(3); // Correlation + 2 standalone Records
    expect(envelopes.map(e => e.kind)).toEqual(['Correlation', 'Record', 'Record']);

    const correlation = envelopes[0];

    expect(correlation.kind).toBe('Correlation');
    expect(correlation.metadata).toEqual({ HKWasUserEntered: '1' });
    expect(correlation.children).toEqual([]); // child Records deliberately not captured
    expect(correlation.attrs.type).toBe('HKCorrelationTypeIdentifierBloodPressure');

    expect(envelopes[1].attrs.type).toBe('HKQuantityTypeIdentifierBloodPressureSystolic');
    expect(envelopes[2].attrs.type).toBe('HKQuantityTypeIdentifierBloodPressureDiastolic');
  });

  it('captures Workout children including WorkoutRoute > FileReference verbatim', async () => {
    const envelopes = await collect(fixtureStream('running-workout.xml'));

    expect(envelopes.length).toBe(1);

    const workout = envelopes[0];

    expect(workout.kind).toBe('Workout');
    expect(workout.attrs.workoutActivityType).toBe('HKWorkoutActivityTypeRunning');
    expect(workout.metadata).toEqual({
      HKIndoorWorkout: '0',
      HKExternalUUID: 'strava://activities/13205603309'
    });

    const childNames = workout.children.map(c => c.name);

    expect(childNames).toEqual(['WorkoutStatistics', 'WorkoutStatistics', 'WorkoutRoute']);

    const route = workout.children.find(c => c.name === 'WorkoutRoute');

    expect(route?.children).toHaveLength(1);
    expect(route?.children[0]?.name).toBe('FileReference');
    expect(route?.children[0]?.attrs.path).toBe('/workout-routes/route_2024-12-30_9.36pm.gpx');
  });

  it('preserves multi-level nesting (Workout > WorkoutActivity > WorkoutEvent)', async () => {
    const envelopes = await collect(fixtureStream('multi-activity-workout.xml'));

    expect(envelopes).toHaveLength(1);

    const workout = envelopes[0];

    const activities = workout.children.filter(c => c.name === 'WorkoutActivity');

    expect(activities).toHaveLength(2);

    const first = activities[0];

    expect(first.attrs.uuid).toBe('D3FE3B79-5F69-41B0-8C81-AD3767F5D1FE');
    expect(first.children.map(c => c.name)).toEqual(['WorkoutEvent', 'WorkoutStatistics']);
    expect(first.children[0].attrs.type).toBe('HKWorkoutEventTypeSegment');
    expect(first.children[1].attrs.sum).toBe('737.521');
  });

  it('captures HeartRateVariabilityMetadataList beats as nested children', async () => {
    const envelopes = await collect(fixtureStream('hrv-with-beats.xml'));

    expect(envelopes).toHaveLength(1);

    const record = envelopes[0];

    expect(record.kind).toBe('Record');
    expect(record.metadata).toEqual({ HKAlgorithmVersion: '2' });

    const hrvList = record.children.find(c => c.name === 'HeartRateVariabilityMetadataList');

    expect(hrvList?.children).toHaveLength(3);
    expect(hrvList?.children.map(c => c.name)).toEqual([
      'InstantaneousBeatsPerMinute',
      'InstantaneousBeatsPerMinute',
      'InstantaneousBeatsPerMinute'
    ]);
    expect(hrvList?.children[0].attrs).toEqual({ bpm: '100', time: '17:07:00,29' });
  });

  it('emits Me + ExportDate informational envelopes and handles inline DTD', async () => {
    const envelopes = await collect(fixtureStream('dtd-header-only.xml'));

    expect(envelopes.map(e => e.kind)).toEqual(['ExportDate', 'Me', 'Record', 'ActivitySummary']);

    const exportDate = envelopes[0];

    expect(exportDate.attrs.value).toBe('2026-05-20 11:44:58 +0100');

    const me = envelopes[1];

    expect(me.attrs.HKCharacteristicTypeIdentifierDateOfBirth).toBe('1982-02-10');
  });

  it('skips unknown top-level elements without emitting them', async () => {
    const xml = `
      <HealthData locale="en_PT">
        <UnknownThing foo="bar"/>
        <Record type="X" sourceName="S" startDate="2024-01-01 00:00:00 +0000" endDate="2024-01-01 00:00:00 +0000"/>
      </HealthData>
    `;

    const envelopes = await collect(streamOf(xml));

    expect(envelopes.map(e => e.kind)).toEqual(['Record']);
  });
});

const E2E = process.env.HARMO_E2E === '1';
const REAL_EXPORT_PATH = '/Users/abelsoares/Projects/harmo/docs/apple_health_export/export.xml';

// Grep counts every <Record open tag (1,172,433). Our parser skips child Records of Correlations
// (122 across 30 Correlations — 25 blood-pressure pairs + 5 multi-nutrient Lose It! food bundles)
// because per the DTD comment they re-appear standalone at top level. So envelope count =
// 1,172,433 - 122 = 1,172,311.
const EXPECTED_TOP_LEVEL_COUNTS: Record<string, number> = {
  Record: 1_172_311,
  ActivitySummary: 506,
  Workout: 160,
  Correlation: 30,
  Me: 1,
  ExportDate: 1
};

describe.skipIf(!E2E)('parseAppleExport — real export (opt-in via HARMO_E2E=1)', () => {
  it('emits envelope counts that match US-1a skim counts', { timeout: 120_000 }, async () => {
    const counts: Record<string, number> = {};

    for await (const envelope of parseAppleExport(createReadStream(REAL_EXPORT_PATH))) {
      counts[envelope.kind] = (counts[envelope.kind] ?? 0) + 1;
    }

    for (const [kind, expected] of Object.entries(EXPECTED_TOP_LEVEL_COUNTS)) {
      expect(counts[kind], `count for ${kind}`).toBe(expected);
    }
  });
});
