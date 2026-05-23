// Detects drift between @harmo/common (live runtime arrays) and the seeded DB.
// If you change packages/common/src/registry/* without writing a new migration that
// re-seeds the tables, this test fails — forcing you to add the migration.
import { ALIASES, METRICS, REGISTRY_VERSION, UNIT_CONVERSIONS } from '@harmo/common';
import { getKnex } from '@src/clients';
import { describe, expect, it } from 'vitest';

describe('registry drift between @harmo/common and DB', () => {
  it('metrics_registry rows match METRICS (count + per-row equality)', async () => {
    const knex = getKnex();
    const rows = await knex('metrics_registry')
      .select<
        Array<{
          metric: string;
          value_kind: string;
          temporal_kind: string;
          canonical_unit: string | null;
          default_agg: string;
          allowed_aggs: string[];
          resolve_overlap: boolean;
          registry_version: number;
        }>
      >('*')
      .orderBy('metric');

    expect(rows).toHaveLength(METRICS.length);
    expect(rows.every(r => r.registry_version === REGISTRY_VERSION)).toBe(true);

    const expected = [...METRICS].sort((a, b) => a.metric.localeCompare(b.metric));

    rows.forEach((row, i) => {
      const m = expected[i];

      expect(row.metric).toBe(m.metric);
      expect(row.value_kind).toBe(m.valueKind);
      expect(row.temporal_kind).toBe(m.temporalKind);
      expect(row.canonical_unit).toBe(m.canonicalUnit);
      expect(row.default_agg).toBe(m.defaultAgg);
      expect(row.allowed_aggs).toEqual(m.allowedAggs);
      expect(row.resolve_overlap).toBe(m.resolveOverlap);
    });
  });

  it('metric_aliases rows match ALIASES', async () => {
    const knex = getKnex();
    const rows = await knex('metric_aliases')
      .select<Array<{ vendor: string; alias: string; metric: string }>>('*')
      .orderBy(['vendor', 'alias']);

    const expected = [...ALIASES].sort((a, b) => a.vendor.localeCompare(b.vendor) || a.alias.localeCompare(b.alias));

    expect(rows).toEqual(expected);
  });

  it('unit_conversions rows match UNIT_CONVERSIONS', async () => {
    const knex = getKnex();
    const rows = await knex('unit_conversions')
      .select<Array<{ from_unit: string; to_unit: string; factor: string; offset: string }>>('*')
      .orderBy(['from_unit', 'to_unit']);

    expect(rows).toHaveLength(UNIT_CONVERSIONS.length);

    const expected = [...UNIT_CONVERSIONS].sort(
      (a, b) => a.fromUnit.localeCompare(b.fromUnit) || a.toUnit.localeCompare(b.toUnit)
    );

    rows.forEach((row, i) => {
      const u = expected[i];

      expect(row.from_unit).toBe(u.fromUnit);
      expect(row.to_unit).toBe(u.toUnit);
      expect(Number(row.factor)).toBeCloseTo(u.factor, 10);
      expect(Number(row.offset)).toBeCloseTo(u.offset, 10);
    });
  });
});
