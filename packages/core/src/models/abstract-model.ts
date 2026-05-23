import { Model } from 'objection';

export default class AbstractModel extends Model {
  static get useLimitInFirst() {
    return true;
  }
}
