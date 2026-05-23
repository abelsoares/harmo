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

export async function findMetricByAlias(knex: Knex, vendor: string, alias: string): Promise<MetricRegistryRow | null> {
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
