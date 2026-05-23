import type { Knex } from 'knex';

export type AggregateBucket = 'hour' | 'day' | 'week' | 'month';
export type AggregateFn = 'sum' | 'avg' | 'min' | 'max' | 'latest';

export type AggregateInput = {
  subjectId: string;
  metric: string;
  bucket: AggregateBucket;
  agg?: AggregateFn;
  from: Date;
  to: Date;
  timezone?: string;
};

export type AggregateRow = {
  bucketStart: Date;
  value: number;
  sampleCount: number;
};

export async function aggregate(_knex: Knex, _input: AggregateInput): Promise<AggregateRow[]> {
  // TODO: registry-aware aggregation with optional source-priority overlap resolution (US-7)
  return [];
}
