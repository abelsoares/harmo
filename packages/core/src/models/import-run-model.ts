import AbstractModel from './abstract-model';

export default class ImportRunModel extends AbstractModel {
  static tableName = 'import_runs';

  id!: string;
  subject_id!: string;
  source_file!: string;
  started_at!: Date;
  finished_at!: Date | null;
  parsed_count!: number;
  queued_count!: number;
  status!: 'running' | 'finished' | 'failed';
  error!: string | null;
}
