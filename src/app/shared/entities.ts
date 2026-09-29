import { Row } from '../core/types/models';
import { EntityConfig, Option, OptionContext } from './entity';

/** Options from another table (id -> a display column). */
const fromTable =
  (table: string, labelKey: string, scoped = false) =>
  async ({ crud, auth }: OptionContext): Promise<Option[]> => {
    const filter: Row = scoped ? { shop_id: auth.shop()?.id ?? null } : {};
    const rows = await crud.list(table, filter, labelKey);
    return rows.map((r) => ({ value: String(r['id']), label: String(r[labelKey] ?? r['id']) }));
  };

/** Options from a jsonb array setting (ISSUE_TYPES, TICKET_STATUSES, ...). */
const fromSetting =
  (key: string) =>
  ({ config }: OptionContext): Option[] =>
    config.list(key).map((v) => ({ value: v, label: v }));

/** App-wide UNITS setting plus the shop's own units. */
const unitOptions = ({ config, auth }: OptionContext): Option[] => {
  const own = ((auth.shop() as unknown as { custom_units?: string[] } | null)?.custom_units ?? []).map(String);
  return [...new Set([...config.list('UNITS'), ...own])].map((u) => ({ value: u, label: u }));
};

/** Adds a unit to the shop's own list (shops.custom_units). */
const addShopUnit = async ({ crud, auth }: OptionContext, unit: string): Promise<void> => {
  const shop = auth.shop() as unknown as { id: string; custom_units?: string[] } | null;
  if (!shop) return;
  const units = [...new Set([...(shop.custom_units ?? []), unit])];
  await crud.update('shops', shop.id, { custom_units: units });
  await auth.loadContext();
};

export const ENTITIES: Record<string, EntityConfig> = {
  // ---- Shop -----------------------------------------------------------------
  stocks: {
    table: 'stocks',
    labelPrefix: 'stocks',
    scope: 'shop',
    order: 'product_name',
    fields: [
      { key: 'image_url', type: 'image', grid: false, image: { bucketSetting: 'PRODUCTS_BUCKET', rulesSetting: 'PRODUCT_IMAGE' } },
      { key: 'product_name', required: true },
      { key: 'qty', type: 'number', required: true },
      { key: 'unit', type: 'select', options: unitOptions, addOption: addShopUnit },
      { key: 'price', type: 'money' },
      { key: 'category' },
      { key: 'show_in_store', type: 'boolean', default: true },
      { key: 'reserved_qty', type: 'number', form: false },
      { key: 'low_stock_threshold', type: 'number', grid: false },
      { key: 'description', type: 'textarea', grid: false },
    ],
  },
  vendors: {
    table: 'vendors',
    labelPrefix: 'vendors',
    scope: 'shop',
    order: 'name',
    fields: [{ key: 'name', required: true }, { key: 'phone' }, { key: 'location' }],
  },
  reminders: {
    table: 'stock_reminders',
    labelPrefix: 'reminders',
    scope: 'shop',
    order: 'reminder_date.desc',
    create: false,
    action: { label: 'reminders.checkNow', rpc: 'generate_my_stock_reminders' },
    fields: [
      { key: 'reminder_date', type: 'date', form: false },
      { key: 'message', form: false },
      { key: 'is_read', type: 'boolean' },
    ],
  },

  support: {
    table: 'support_tickets',
    labelPrefix: 'support',
    scope: 'user',
    order: 'created_at.desc',
    edit: false,
    remove: false,
    fields: [
      { key: 'created_at', type: 'date', form: false },
      { key: 'issue_type', type: 'select', required: true, options: fromSetting('ISSUE_TYPES') },
      { key: 'description', type: 'textarea', required: true },
      { key: 'status', form: false },
    ],
  },

  // ---- Admin ----------------------------------------------------------------
  roles: {
    table: 'roles',
    labelPrefix: 'roles',
    order: 'name',
    fields: [
      { key: 'name', required: true },
      { key: 'description' },
      { key: 'permissions', type: 'json', required: true },
    ],
  },
  pricing: {
    table: 'pricing_plans',
    labelPrefix: 'pricing',
    order: 'sort_order',
    fields: [
      { key: 'name', required: true },
      { key: 'price', type: 'money', required: true },
      { key: 'duration_days', type: 'number', required: true },
      { key: 'features', type: 'json', grid: false },
      { key: 'is_active', type: 'boolean' },
      { key: 'sort_order', type: 'number' },
    ],
  },
  shops: {
    table: 'shops',
    labelPrefix: 'shops',
    order: 'created_at.desc',
    create: false,
    fields: [
      { key: 'name', required: true },
      { key: 'subscription_plan_id', type: 'select', options: fromTable('pricing_plans', 'name') },
      { key: 'subscription_expires_at', type: 'date' },
      { key: 'is_test', type: 'boolean' },
      { key: 'created_at', type: 'date', form: false },
    ],
  },
  users: {
    table: 'users_profile',
    labelPrefix: 'users',
    order: 'created_at.desc',
    create: false,
    fields: [
      { key: 'phone', form: false },
      { key: 'username' },
      { key: 'role_id', type: 'select', options: fromTable('roles', 'name') },
      { key: 'shop_id', type: 'select', options: fromTable('shops', 'name') },
      { key: 'is_test', type: 'boolean' },
    ],
  },
  tickets: {
    table: 'support_tickets',
    labelPrefix: 'tickets',
    order: 'created_at.desc',
    create: false,
    fields: [
      { key: 'created_at', type: 'date', form: false },
      { key: 'issue_type', form: false },
      { key: 'description', type: 'textarea', form: false },
      { key: 'status', type: 'select', required: true, options: fromSetting('TICKET_STATUSES') },
    ],
  },
};

export { fromSetting, fromTable };
