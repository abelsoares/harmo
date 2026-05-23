import AbstractModel from './abstract-model';

export default class CorrelationModel extends AbstractModel {
  static tableName = 'correlations';

  id!: string;
  subject_id!: string;
  source_id!: string;
  metric!: string;
  start_time!: Date;
  end_time!: Date;
  external_id!: string;
  metadata!: Record<string, unknown>;
  created_at!: Date;
}
