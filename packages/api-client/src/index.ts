import type {
  AggregateParams,
  ApiAggregateRow,
  ApiCorrelation,
  ApiError,
  ApiHealth,
  ApiImport,
  ApiMetric,
  ApiSample,
  ApiSource,
  ApiSummary,
  ApiWorkout,
  CorrelationsParams,
  DateInput,
  ImportsParams,
  SamplesParams,
  SourcesParams,
  SummaryParams,
  WorkoutsParams
} from './types';

export * from './types';

export type HarmoClientConfig = {
  baseUrl: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
};

export class HarmoApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.status = status;
    this.code = error.code;
    this.details = error.details;
    this.name = 'HarmoApiError';
  }
}

function asIso(value: DateInput): string {
  return value instanceof Date ? value.toISOString() : value;
}

function buildQuery(params: Record<string, unknown>): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const v of value) {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
      }
      continue;
    }

    if (value instanceof Date) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value.toISOString())}`);
      continue;
    }

    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }

  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

export class HarmoClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultHeaders: Record<string, string>;

  constructor(config: HarmoClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.fetchImpl = config.fetch ?? globalThis.fetch;
    this.defaultHeaders = { accept: 'application/json', ...(config.headers ?? {}) };

    if (!this.fetchImpl) {
      throw new Error('fetch is not available; pass `fetch` in HarmoClientConfig');
    }
  }

  // === core request ===

  private async request<T>(path: string, query: Record<string, unknown> = {}): Promise<T> {
    const url = `${this.baseUrl}${path}${buildQuery(query)}`;
    const res = await this.fetchImpl(url, { headers: this.defaultHeaders });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;

    if (!res.ok) {
      const err = body?.error ?? { code: 'unknown', message: `request failed with status ${res.status}` };

      throw new HarmoApiError(res.status, err);
    }

    return body as T;
  }

  // === public endpoints ===

  health(): Promise<{ data: ApiHealth }> {
    return this.request('/v1/health');
  }

  metrics(): Promise<{ registry_version: number; data: ApiMetric[] }> {
    return this.request('/v1/metrics');
  }

  sources(params: SourcesParams): Promise<{ data: ApiSource[] }> {
    return this.request(`/v1/subjects/${encodeURIComponent(params.subjectId)}/sources`, {
      vendor: params.vendor,
      include_sample_count: params.includeSampleCount ? 'true' : undefined
    });
  }

  samples(params: SamplesParams): Promise<{ data: ApiSample[]; next_cursor: string | null }> {
    return this.request(`/v1/subjects/${encodeURIComponent(params.subjectId)}/samples`, {
      metric: params.metric,
      from: asIso(params.from),
      to: asIso(params.to),
      source_id: params.sourceId,
      order: params.order,
      limit: params.limit,
      cursor: params.cursor
    });
  }

  aggregate(params: AggregateParams): Promise<{
    metric: string;
    bucket: string;
    agg: string;
    timezone: string | null;
    data: ApiAggregateRow[];
  }> {
    return this.request(`/v1/subjects/${encodeURIComponent(params.subjectId)}/aggregate`, {
      metric: params.metric,
      bucket: params.bucket,
      from: asIso(params.from),
      to: asIso(params.to),
      agg: params.agg,
      timezone: params.timezone
    });
  }

  workouts(params: WorkoutsParams): Promise<{ data: ApiWorkout[]; next_cursor: string | null }> {
    return this.request(`/v1/subjects/${encodeURIComponent(params.subjectId)}/workouts`, {
      from: asIso(params.from),
      to: asIso(params.to),
      activity_type: params.activityType,
      source_id: params.sourceId,
      order: params.order,
      limit: params.limit,
      cursor: params.cursor
    });
  }

  workout(subjectId: string, workoutId: string): Promise<{ data: ApiWorkout }> {
    return this.request(`/v1/subjects/${encodeURIComponent(subjectId)}/workouts/${encodeURIComponent(workoutId)}`);
  }

  correlations(params: CorrelationsParams): Promise<{ data: ApiCorrelation[] }> {
    return this.request(`/v1/subjects/${encodeURIComponent(params.subjectId)}/correlations`, {
      metric: params.metric,
      from: asIso(params.from),
      to: asIso(params.to),
      include_linked_samples: params.includeLinkedSamples ? 'true' : undefined
    });
  }

  summary(params: SummaryParams): Promise<{ data: ApiSummary }> {
    return this.request(`/v1/subjects/${encodeURIComponent(params.subjectId)}/summary`, {
      from: params.from ? asIso(params.from) : undefined,
      to: params.to ? asIso(params.to) : undefined,
      timezone: params.timezone
    });
  }

  imports(params: ImportsParams): Promise<{ data: ApiImport[] }> {
    return this.request(`/v1/subjects/${encodeURIComponent(params.subjectId)}/imports`, {
      limit: params.limit
    });
  }

  // === pagination helpers — auto-follow cursors ===

  /**
   * Iterates every sample matching the params, transparently following cursors.
   *
   * @example
   * for await (const s of client.streamSamples({ subjectId: 'default', metric: 'heart_rate', from, to })) {
   *   // process s
   * }
   */
  async *streamSamples(params: SamplesParams): AsyncIterable<ApiSample> {
    let cursor: string | undefined = params.cursor;

    while (true) {
      const page = await this.samples({ ...params, cursor });

      yield* page.data;

      if (!page.next_cursor) {
        return;
      }

      cursor = page.next_cursor;
    }
  }

  /**
   * Iterates every workout matching the params, transparently following cursors.
   */
  async *streamWorkouts(params: WorkoutsParams): AsyncIterable<ApiWorkout> {
    let cursor: string | undefined = params.cursor;

    while (true) {
      const page = await this.workouts({ ...params, cursor });

      yield* page.data;

      if (!page.next_cursor) {
        return;
      }

      cursor = page.next_cursor;
    }
  }

  /**
   * Reads ALL samples into memory. Convenient for small ranges; for large ranges
   * use `streamSamples()` to keep memory bounded.
   */
  async allSamples(params: SamplesParams): Promise<ApiSample[]> {
    const out: ApiSample[] = [];

    for await (const s of this.streamSamples(params)) {
      out.push(s);
    }

    return out;
  }
}
