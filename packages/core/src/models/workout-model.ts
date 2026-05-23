import AbstractModel from './abstract-model';

export default class WorkoutModel extends AbstractModel {
  static tableName = 'workouts';

  id!: string;
  subject_id!: string;
  source_id!: string;
  activity_type!: string;
  start_time!: Date;
  end_time!: Date;
  duration_s!: number;
  external_id!: string;
  metadata!: Record<string, unknown>;
  created_at!: Date;
}
