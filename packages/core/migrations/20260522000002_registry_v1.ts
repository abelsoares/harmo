// Frozen snapshot of REGISTRY_VERSION = 1.
// Migrations must be immutable: do NOT import from @harmo/common here.
// When bumping to v2: edit packages/common/src/registry/* and add a new
// migrations/<ts>_registry_v2.ts that inlines the new arrays.
import type { Knex } from 'knex';

const REGISTRY_VERSION = 1;

const METRICS = [
  {
    metric: 'heart_rate',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'count/min',
    default_agg: 'avg',
    allowed_aggs: ['avg', 'min', 'max', 'latest'],
    resolve_overlap: true
  },
  {
    metric: 'resting_heart_rate',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'count/min',
    default_agg: 'avg',
    allowed_aggs: ['avg', 'min', 'max', 'latest'],
    resolve_overlap: false
  },
  {
    metric: 'step_count',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'count',
    default_agg: 'sum',
    allowed_aggs: ['sum'],
    resolve_overlap: true
  },
  {
    metric: 'distance_walking_running',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'km',
    default_agg: 'sum',
    allowed_aggs: ['sum'],
    resolve_overlap: true
  },
  {
    metric: 'active_energy_burned',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'kcal',
    default_agg: 'sum',
    allowed_aggs: ['sum'],
    resolve_overlap: true
  },
  {
    metric: 'basal_energy_burned',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'kcal',
    default_agg: 'sum',
    allowed_aggs: ['sum'],
    resolve_overlap: false
  },
  {
    metric: 'body_mass',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'kg',
    default_agg: 'latest',
    allowed_aggs: ['avg', 'min', 'max', 'latest'],
    resolve_overlap: false
  },
  {
    metric: 'sleep_analysis',
    value_kind: 'category',
    temporal_kind: 'interval',
    canonical_unit: null,
    default_agg: 'latest',
    allowed_aggs: ['latest'],
    resolve_overlap: true
  },
  {
    metric: 'oxygen_saturation',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: '%',
    default_agg: 'avg',
    allowed_aggs: ['avg', 'min', 'max', 'latest'],
    resolve_overlap: false
  },
  {
    metric: 'blood_pressure_systolic',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'mmHg',
    default_agg: 'latest',
    allowed_aggs: ['avg', 'min', 'max', 'latest'],
    resolve_overlap: false
  },
  {
    metric: 'blood_pressure_diastolic',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'mmHg',
    default_agg: 'latest',
    allowed_aggs: ['avg', 'min', 'max', 'latest'],
    resolve_overlap: false
  }
] as const;

const ALIASES = [
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierHeartRate', metric: 'heart_rate' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierRestingHeartRate', metric: 'resting_heart_rate' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierStepCount', metric: 'step_count' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDistanceWalkingRunning', metric: 'distance_walking_running' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierActiveEnergyBurned', metric: 'active_energy_burned' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierBasalEnergyBurned', metric: 'basal_energy_burned' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierBodyMass', metric: 'body_mass' },
  { vendor: 'apple', alias: 'HKCategoryTypeIdentifierSleepAnalysis', metric: 'sleep_analysis' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierOxygenSaturation', metric: 'oxygen_saturation' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierBloodPressureSystolic', metric: 'blood_pressure_systolic' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierBloodPressureDiastolic', metric: 'blood_pressure_diastolic' }
] as const;

const UNIT_CONVERSIONS = [
  { from_unit: 'count/min', to_unit: 'count/min', factor: 1, offset: 0 },
  { from_unit: 'count', to_unit: 'count', factor: 1, offset: 0 },
  { from_unit: 'km', to_unit: 'km', factor: 1, offset: 0 },
  { from_unit: 'mi', to_unit: 'km', factor: 1.609344, offset: 0 },
  { from_unit: 'm', to_unit: 'km', factor: 0.001, offset: 0 },
  { from_unit: 'kcal', to_unit: 'kcal', factor: 1, offset: 0 },
  { from_unit: 'Cal', to_unit: 'kcal', factor: 1, offset: 0 },
  { from_unit: 'kg', to_unit: 'kg', factor: 1, offset: 0 },
  { from_unit: 'lb', to_unit: 'kg', factor: 0.45359237, offset: 0 },
  { from_unit: '%', to_unit: '%', factor: 1, offset: 0 },
  { from_unit: 'mmHg', to_unit: 'mmHg', factor: 1, offset: 0 },
  { from_unit: 'degF', to_unit: 'degC', factor: 0.5555555555555556, offset: -17.77777777777778 },
  { from_unit: 'degC', to_unit: 'degC', factor: 1, offset: 0 }
] as const;

export const up = async (knex: Knex): Promise<void> => {
  await knex('metric_aliases').delete();
  await knex('unit_conversions').delete();
  await knex('metrics_registry').delete();

  await knex('metrics_registry').insert(METRICS.map(m => ({ ...m, registry_version: REGISTRY_VERSION })));
  await knex('metric_aliases').insert(ALIASES.map(a => ({ ...a })));
  await knex('unit_conversions').insert(UNIT_CONVERSIONS.map(u => ({ ...u })));
};

export const down = async (knex: Knex): Promise<void> => {
  await knex('metric_aliases').delete();
  await knex('unit_conversions').delete();
  await knex('metrics_registry').delete();
};
