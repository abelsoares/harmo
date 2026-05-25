// Response shapes returned by the harmo v1 API.
// Snake_case matches the wire format; the client returns these unchanged
// so consumers can plug them into JSON-serialized state with no remapping.

export type ApiBucket = 'hour' | 'day' | 'week' | 'month';
export type ApiAggFn = 'sum' | 'avg' | 'min' | 'max' | 'latest';

export type ApiHealth = {
  status: 'ok' | 'degraded';
  registry_version: number;
  db: { connected: boolean };
  started_at: string;
};

export type ApiMetric = {
  metric: string;
  value_kind: 'quantity' | 'category';
  temporal_kind: 'instant' | 'interval' | 'cumulative';
  canonical_unit: string | null;
  default_agg: ApiAggFn;
  allowed_aggs: ApiAggFn[];
  resolve_overlap: boolean;
};

export type ApiSource = {
  id: string;
  vendor: string;
  source_name: string;
  manufacturer: string | null;
  hardware_version: string | null;
  software_version: string | null;
  product_type: string | null;
  sample_count?: number;
};

export type ApiSample = {
  id: string;
  metric: string;
  value_num: number | null;
  value_text: string | null;
  unit: string | null;
  start_time: string;
  end_time: string;
  start_offset_minutes: number | null;
  source_id: string;
  workout_id: string | null;
  correlation_id: string | null;
  external_id: string;
  registry_version: number;
  metadata: Record<string, unknown>;
  ingested_at: string;
};

export type ApiAggregateRow = {
  bucket_start: string;
  value: number;
  sample_count: number;
};

export type ApiWorkout = {
  id: string;
  source_id: string;
  source_name: string;
  activity_type: string;
  start_time: string;
  end_time: string;
  duration_s: number;
  external_id: string;
  metadata: Record<string, unknown>;
};

export type ApiCorrelation = {
  id: string;
  metric: string;
  source_id: string;
  source_name: string;
  start_time: string;
  end_time: string;
  external_id: string;
  metadata: Record<string, unknown>;
  linked_samples?: Array<{
    id: string;
    metric: string;
    value_num: number | null;
    value_text: string | null;
    unit: string | null;
    start_time: string;
    end_time: string;
  }>;
};

export type ApiSummary = {
  subject_id: string;
  timezone: string;
  range: { from: string; to: string };
  totals: {
    samples: number;
    workouts: number;
    correlations: number;
    sources: number;
    quarantine: number;
  };
  per_metric: Array<{
    metric: string;
    sample_count: number;
    first_at: string | null;
    last_at: string | null;
  }>;
  workouts_by_activity: Array<{
    activity_type: string;
    count: number;
    total_duration_seconds: number;
  }>;
  sources_count: number;
};

export type ApiImport = {
  id: string;
  status: string;
  source_file: string;
  started_at: string;
  finished_at: string | null;
  parsed_count: number;
  queued_count: number;
  duration_ms: number | null;
  error: string | null;
};

export type ApiError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

// === request param shapes ===

export type DateInput = Date | string;

export type SamplesParams = {
  subjectId: string;
  metric: string;
  from: DateInput;
  to: DateInput;
  sourceId?: string | string[];
  order?: 'asc' | 'desc';
  limit?: number;
  cursor?: string;
};

export type AggregateParams = {
  subjectId: string;
  metric: string;
  bucket: ApiBucket;
  from: DateInput;
  to: DateInput;
  agg?: ApiAggFn;
  timezone?: string;
};

export type WorkoutsParams = {
  subjectId: string;
  from: DateInput;
  to: DateInput;
  activityType?: string | string[];
  sourceId?: string | string[];
  order?: 'asc' | 'desc';
  limit?: number;
  cursor?: string;
};

export type CorrelationsParams = {
  subjectId: string;
  metric?: string;
  from: DateInput;
  to: DateInput;
  includeLinkedSamples?: boolean;
};

export type SourcesParams = {
  subjectId: string;
  vendor?: string;
  includeSampleCount?: boolean;
};

export type SummaryParams = {
  subjectId: string;
  from?: DateInput;
  to?: DateInput;
  timezone?: string;
};

export type ImportsParams = {
  subjectId: string;
  limit?: number;
};
