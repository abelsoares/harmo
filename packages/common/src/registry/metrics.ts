export const REGISTRY_VERSION = 1;

export type ValueKind = 'quantity' | 'category';
export type TemporalKind = 'instant' | 'interval' | 'cumulative';
export type AggregationFn = 'sum' | 'avg' | 'min' | 'max' | 'latest';

export type MetricDefinition = {
  metric: string;
  valueKind: ValueKind;
  temporalKind: TemporalKind;
  canonicalUnit: string | null;
  defaultAgg: AggregationFn;
  allowedAggs: AggregationFn[];
  resolveOverlap: boolean;
};

export const METRICS: MetricDefinition[] = [
  {
    metric: 'heart_rate',
    valueKind: 'quantity',
    temporalKind: 'instant',
    canonicalUnit: 'count/min',
    defaultAgg: 'avg',
    allowedAggs: ['avg', 'min', 'max', 'latest'],
    resolveOverlap: true
  },
  {
    metric: 'resting_heart_rate',
    valueKind: 'quantity',
    temporalKind: 'instant',
    canonicalUnit: 'count/min',
    defaultAgg: 'avg',
    allowedAggs: ['avg', 'min', 'max', 'latest'],
    resolveOverlap: false
  },
  {
    metric: 'step_count',
    valueKind: 'quantity',
    temporalKind: 'cumulative',
    canonicalUnit: 'count',
    defaultAgg: 'sum',
    allowedAggs: ['sum'],
    resolveOverlap: true
  },
  {
    metric: 'distance_walking_running',
    valueKind: 'quantity',
    temporalKind: 'cumulative',
    canonicalUnit: 'km',
    defaultAgg: 'sum',
    allowedAggs: ['sum'],
    resolveOverlap: true
  },
  {
    metric: 'active_energy_burned',
    valueKind: 'quantity',
    temporalKind: 'cumulative',
    canonicalUnit: 'kcal',
    defaultAgg: 'sum',
    allowedAggs: ['sum'],
    resolveOverlap: true
  },
  {
    metric: 'basal_energy_burned',
    valueKind: 'quantity',
    temporalKind: 'cumulative',
    canonicalUnit: 'kcal',
    defaultAgg: 'sum',
    allowedAggs: ['sum'],
    resolveOverlap: false
  },
  {
    metric: 'body_mass',
    valueKind: 'quantity',
    temporalKind: 'instant',
    canonicalUnit: 'kg',
    defaultAgg: 'latest',
    allowedAggs: ['avg', 'min', 'max', 'latest'],
    resolveOverlap: false
  },
  {
    metric: 'sleep_analysis',
    valueKind: 'category',
    temporalKind: 'interval',
    canonicalUnit: null,
    defaultAgg: 'latest',
    allowedAggs: ['latest'],
    resolveOverlap: true
  },
  {
    metric: 'oxygen_saturation',
    valueKind: 'quantity',
    temporalKind: 'instant',
    canonicalUnit: '%',
    defaultAgg: 'avg',
    allowedAggs: ['avg', 'min', 'max', 'latest'],
    resolveOverlap: false
  },
  {
    metric: 'blood_pressure_systolic',
    valueKind: 'quantity',
    temporalKind: 'instant',
    canonicalUnit: 'mmHg',
    defaultAgg: 'latest',
    allowedAggs: ['avg', 'min', 'max', 'latest'],
    resolveOverlap: false
  },
  {
    metric: 'blood_pressure_diastolic',
    valueKind: 'quantity',
    temporalKind: 'instant',
    canonicalUnit: 'mmHg',
    defaultAgg: 'latest',
    allowedAggs: ['avg', 'min', 'max', 'latest'],
    resolveOverlap: false
  }
];
