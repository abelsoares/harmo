import { Readable } from 'node:stream';
import { skimAppleExport } from '@src/normalize/apple/skim';
import { describe, expect, it } from 'vitest';

function streamOf(xml: string): Readable {
  return Readable.from(Buffer.from(xml, 'utf-8'));
}

async function collect(xml: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  for await (const event of skimAppleExport(streamOf(xml))) {
    counts[event.kind] = (counts[event.kind] ?? 0) + 1;
  }

  return counts;
}

describe('skimAppleExport', () => {
  it('emits one event per opening tag at every depth', async () => {
    const xml = `
      <HealthData locale="en_PT">
        <Record type="HKQuantityTypeIdentifierHeartRate" value="72"/>
        <Record type="HKQuantityTypeIdentifierStepCount" value="14"/>
        <Workout workoutActivityType="HKWorkoutActivityTypeRunning">
          <WorkoutStatistics type="X"/>
          <WorkoutEvent type="Y"/>
        </Workout>
      </HealthData>
    `;

    const counts = await collect(xml);

    expect(counts).toMatchObject({
      HealthData: 1,
      Record: 2,
      Workout: 1,
      WorkoutStatistics: 1,
      WorkoutEvent: 1
    });
  });

  it('counts Correlation child Records (depth-agnostic)', async () => {
    const xml = `
      <HealthData locale="en_PT">
        <Correlation type="HKCorrelationTypeIdentifierBloodPressure">
          <Record type="HKQuantityTypeIdentifierBloodPressureSystolic" value="135"/>
          <Record type="HKQuantityTypeIdentifierBloodPressureDiastolic" value="78"/>
        </Correlation>
        <Record type="HKQuantityTypeIdentifierBloodPressureSystolic" value="135"/>
        <Record type="HKQuantityTypeIdentifierBloodPressureDiastolic" value="78"/>
      </HealthData>
    `;

    const counts = await collect(xml);

    expect(counts.Correlation).toBe(1);
    expect(counts.Record).toBe(4);
  });

  it('parses an Apple-style DTD prefix without choking', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [
<!ELEMENT HealthData (Record*)>
<!ATTLIST HealthData locale CDATA #REQUIRED>
<!ELEMENT Record EMPTY>
<!ATTLIST Record type CDATA #REQUIRED value CDATA #IMPLIED>
]>
<HealthData locale="en_PT">
  <Record type="HKQuantityTypeIdentifierHeartRate" value="72"/>
</HealthData>`;

    const counts = await collect(xml);

    expect(counts.HealthData).toBe(1);
    expect(counts.Record).toBe(1);
  });

  it('handles HRV records with inline InstantaneousBeatsPerMinute children', async () => {
    const xml = `
      <HealthData locale="en_PT">
        <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" value="26">
          <HeartRateVariabilityMetadataList>
            <InstantaneousBeatsPerMinute bpm="100" time="17:07:00,29"/>
            <InstantaneousBeatsPerMinute bpm="98"  time="17:07:00,90"/>
          </HeartRateVariabilityMetadataList>
        </Record>
      </HealthData>
    `;

    const counts = await collect(xml);

    expect(counts.Record).toBe(1);
    expect(counts.HeartRateVariabilityMetadataList).toBe(1);
    expect(counts.InstantaneousBeatsPerMinute).toBe(2);
  });
});
