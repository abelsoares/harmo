import AbstractModel from './abstract-model';

export default class QuarantineModel extends AbstractModel {
  static tableName = 'quarantine';

  id!: string;
  subject_id!: string;
  vendor!: string;
  reason!: string;
  raw!: unknown;
  context!: Record<string, unknown>;
  registry_version!: number | null;
  created_at!: Date;
}
