import AbstractModel from './abstract-model';

export default class SubjectModel extends AbstractModel {
  static tableName = 'subjects';
  static idColumn = 'id';

  id!: string;
  timezone!: string;
  created_at!: Date;
  updated_at!: Date;
}
