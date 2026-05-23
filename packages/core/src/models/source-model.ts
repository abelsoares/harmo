import AbstractModel from './abstract-model';

export default class SourceModel extends AbstractModel {
  static tableName = 'sources';

  id!: string;
  subject_id!: string;
  vendor!: string;
  source_name!: string;
  manufacturer!: string | null;
  hardware_version!: string | null;
  software_version!: string | null;
  product_type!: string | null;
  identity_hash!: string;
  created_at!: Date;
  updated_at!: Date;
}
