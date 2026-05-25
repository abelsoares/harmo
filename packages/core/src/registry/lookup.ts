import type { Knex } from 'knex';

export type MetricRegistryRow = {
  metric: string;
  value_kind: 'quantity' | 'category';
  temporal_kind: 'instant' | 'interval' | 'cumulative';
  canonical_unit: string | null;
  default_agg: string;
  allowed_aggs: string[];
  resolve_overlap: boolean;
  registry_version: number;
};

// In-memory registry cache. Optional — call warmRegistry() to enable; otherwise lookups fall
// back to the DB. The cache makes bulk imports (1M+ envelopes) feasible without one DB
// round-trip per record.
let aliasCache: Map<string, MetricRegistryRow> | null = null;
let unitCache: Map<string, { factor: number; offset: number }> | null = null;

export async function warmRegistry(knex: Knex): Promise<void> {
  const aliases = await knex('metric_aliases')
    .join('metrics_registry', 'metric_aliases.metric', 'metrics_registry.metric')
    .select<
      Array<{
        vendor: string;
        alias: string;
        metric: string;
        value_kind: 'quantity' | 'category';
        temporal_kind: 'instant' | 'interval' | 'cumulative';
        canonical_unit: string | null;
        default_agg: string;
        allowed_aggs: string[];
        resolve_overlap: boolean;
        registry_version: number;
      }>
    >(
      'metric_aliases.vendor',
      'metric_aliases.alias',
      'metrics_registry.metric',
      'metrics_registry.value_kind',
      'metrics_registry.temporal_kind',
      'metrics_registry.canonical_unit',
      'metrics_registry.default_agg',
      'metrics_registry.allowed_aggs',
      'metrics_registry.resolve_overlap',
      'metrics_registry.registry_version'
    );

  aliasCache = new Map(
    aliases.map(a => [
      `${a.vendor}|${a.alias}`,
      {
        metric: a.metric,
        value_kind: a.value_kind,
        temporal_kind: a.temporal_kind,
        canonical_unit: a.canonical_unit,
        default_agg: a.default_agg,
        allowed_aggs: a.allowed_aggs,
        resolve_overlap: a.resolve_overlap,
        registry_version: a.registry_version
      }
    ])
  );

  const conversions = await knex('unit_conversions').select<
    Array<{ from_unit: string; to_unit: string; factor: string; offset: string }>
  >('*');

  unitCache = new Map(
    conversions.map(u => [`${u.from_unit}|${u.to_unit}`, { factor: Number(u.factor), offset: Number(u.offset) }])
  );
}

export function resetRegistryCache(): void {
  aliasCache = null;
  unitCache = null;
}

export async function findMetricByAlias(knex: Knex, vendor: string, alias: string): Promise<MetricRegistryRow | null> {
  if (aliasCache) {
    return aliasCache.get(`${vendor}|${alias}`) ?? null;
  }

  const row = await knex('metric_aliases')
    .join('metrics_registry', 'metric_aliases.metric', 'metrics_registry.metric')
    .where('metric_aliases.vendor', vendor)
    .andWhere('metric_aliases.alias', alias)
    .select<MetricRegistryRow>('metrics_registry.*')
    .first();

  return row ?? null;
}

export async function findUnitConversion(
  knex: Knex,
  fromUnit: string,
  toUnit: string
): Promise<{ factor: number; offset: number } | null> {
  if (fromUnit === toUnit) {
    return { factor: 1, offset: 0 };
  }

  if (unitCache) {
    return unitCache.get(`${fromUnit}|${toUnit}`) ?? null;
  }

  const row = await knex('unit_conversions')
    .where({ from_unit: fromUnit, to_unit: toUnit })
    .first<{ factor: string; offset: string } | undefined>();

  if (!row) {
    return null;
  }

  return { factor: Number(row.factor), offset: Number(row.offset) };
}

export function convertUnit(value: number, conv: { factor: number; offset: number }): number {
  return value * conv.factor + conv.offset;
}
