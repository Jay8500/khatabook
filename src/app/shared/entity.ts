import { Row } from '../core/types/models';
import { AuthService } from '../core/services/auth.service';
import { ConfigService } from '../core/services/config.service';
import { CrudService } from '../core/services/crud.service';

export type FieldType =
  | 'text'
  | 'number'
  | 'textarea'
  | 'json'
  | 'boolean'
  | 'select'
  | 'date'
  | 'money'
  | 'image';

export interface Option {
  value: string;
  label: string;
}

export interface OptionContext {
  crud: CrudService;
  config: ConfigService;
  auth: AuthService;
}

export interface FieldDef {
  key: string;
  type?: FieldType;
  required?: boolean;
  /** Primary keys such as app_settings.key cannot change once saved. */
  readonlyOnEdit?: boolean;
  /** Hide from the grid (still editable) or from the form (still listed). */
  grid?: boolean;
  form?: boolean;
  options?: (ctx: OptionContext) => Promise<Option[]> | Option[];
  /** Value for new rows (e.g. a checkbox that starts ticked). */
  default?: unknown;
  /** type 'image': app_settings keys of the storage bucket and the image rules. */
  image?: { bucketSetting: string; rulesSetting: string };
}

export interface EntityConfig {
  table: string;
  /** Label keys are `${labelPrefix}.title` and `${labelPrefix}.${field.key}` in UI_LABELS. */
  labelPrefix: string;
  fields: FieldDef[];
  order?: string;
  /**
   * 'shop': rows of the user's shop; new rows get shop_id.
   * 'user': rows the user created; new rows get the user's shop_id (if any).
   */
  scope?: 'shop' | 'user' | 'none';
  create?: boolean;
  edit?: boolean;
  remove?: boolean;
  /** Extra header button that calls an RPC returning a count (e.g. check stock now). */
  action?: { label: string; rpc: string };
}

export type OptionMap = Record<string, Option[]>;

/** Primary key column; app_settings is keyed by `key`, everything else by `id`. */
export function primaryKey(config: EntityConfig): string {
  return config.table === 'app_settings' ? 'key' : 'id';
}

export function displayValue(
  field: FieldDef,
  row: Row,
  options: OptionMap,
  config: ConfigService,
): string {
  const value = row[field.key];
  if (value === null || value === undefined || value === '') return '';
  switch (field.type) {
    case 'select':
      return options[field.key]?.find((o) => o.value === String(value))?.label ?? String(value);
    case 'boolean':
      return value ? '✓' : '—';
    case 'money':
      return config.money(value);
    case 'date':
      return config.date(value);
    case 'json':
      return JSON.stringify(value);
    case 'image':
      return '📷';
    default:
      return String(value);
  }
}
