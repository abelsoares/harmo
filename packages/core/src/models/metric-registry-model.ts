import AbstractModel from './abstract-model';

export default class MetricRegistryModel extends AbstractModel {
  static tableName = 'metrics_registry';
  static idColumn = 'metric';

  metric!: string;
  value_kind!: 'quantity' | 'category';
  temporal_kind!: 'instant' | 'interval' | 'cumulative';
  canonical_unit!: string | null;
  default_agg!: string;
  allowed_aggs!: string[];
  resolve_overlap!: boolean;
  registry_version!: number;
  created_at!: Date;
}
