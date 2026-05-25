import { DEFAULT_SUBJECT_ID, type CanonicalSample, type RawApplePayload, type RawEnvelope } from '@harmo/common';
import { dispatchNormalize } from '@src/normalize/dispatch';
import type { Knex } from 'knex';
import { ingestCanonical } from './canonical';
import { upsertCorrelation } from './correlation';
import { upsertSource } from './source-cache';
import { upsertWorkout } from './workout';

export type BulkStats = {
  processed: number;
  samples: number;
  workouts: number;
  correlations: number;
  quarantined: number;
};

export class BulkProcessor {
  private sampleBuffer: CanonicalSample[] = [];
  private quarantineBuffer: Array<{ vendor: string; reason: string; raw: unknown; context?: Record<string, unknown> }> = [];
  private stats: BulkStats = { processed: 0, samples: 0, workouts: 0, correlations: 0, quarantined: 0 };

  constructor(
    private readonly knex: Knex,
    private readonly batchId: string,
    private readonly flushSize: number = 500,
    private readonly subjectId: string = DEFAULT_SUBJECT_ID
  ) {}

  async process(payload: RawApplePayload): Promise<void> {
    const envelope: RawEnvelope = { vendor: 'apple', batchId: this.batchId, payload };
    const result = await dispatchNormalize(this.knex, envelope);

    this.stats.processed += 1;

    if (result.kind === 'sample') {
      const sourceId = await upsertSource(this.knex, result.source);

      this.sampleBuffer.push({ ...result.sample, sourceId });
      this.stats.samples += 1;

      if (this.sampleBuffer.length >= this.flushSize) {
        await this.flushSamples();
      }

      return;
    }

    if (result.kind === 'workout') {
      // Drain pending samples first so we don't FK-violate later (workout_id refs).
      await this.flushSamples();
      const sourceId = await upsertSource(this.knex, result.source);

      await upsertWorkout(this.knex, sourceId, result.workout);
      this.stats.workouts += 1;

      return;
    }

    if (result.kind === 'correlation') {
      await this.flushSamples();
      const sourceId = await upsertSource(this.knex, result.source);

      await upsertCorrelation(this.knex, sourceId, result.correlation);
      this.stats.correlations += 1;

      return;
    }

    // quarantine
    this.quarantineBuffer.push({
      vendor: envelope.vendor,
      reason: result.reason,
      raw: envelope,
      context: result.context
    });
    this.stats.quarantined += 1;

    if (this.quarantineBuffer.length >= this.flushSize) {
      await this.flushQuarantine();
    }
  }

  async flush(): Promise<void> {
    await this.flushSamples();
    await this.flushQuarantine();
  }

  private async flushSamples(): Promise<void> {
    if (this.sampleBuffer.length === 0) {
      return;
    }

    await ingestCanonical(this.knex, this.sampleBuffer);
    this.sampleBuffer = [];
  }

  private async flushQuarantine(): Promise<void> {
    if (this.quarantineBuffer.length === 0) {
      return;
    }

    const items = this.quarantineBuffer;

    this.quarantineBuffer = [];

    // Bulk insert — far faster than one INSERT per item when quarantine count is large.
    await this.knex('quarantine').insert(
      items.map(q => ({
        subject_id: this.subjectId,
        vendor: q.vendor,
        reason: q.reason,
        raw: JSON.stringify(q.raw),
        context: JSON.stringify(q.context ?? {})
      }))
    );
  }

  getStats(): BulkStats {
    return { ...this.stats };
  }
}
