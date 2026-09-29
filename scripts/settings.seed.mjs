// Source of truth for the initial app_settings rows. Generates:
//   <migration file passed as argv[2]>  all settings, roles, default plan
//   public/config/bootstrap.json        public settings only (offline / first paint)
// Run: node scripts/settings.seed.mjs supabase/migrations/<timestamp>_seed.sql
// Seeds only: admins change values in the app afterwards.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const labels = {
  'app.logoAlt': 'Logo',
  'footer.poweredBy': 'Powered by',
  'network.online': 'Online',
  'network.offline': 'Offline',
  'theme.toggle': 'Toggle dark mode',
  'toast.dismiss': 'Dismiss',

  'nav.home': 'Home',
  'nav.stocks': 'Stock',
  'nav.purchases': 'Purchases',
  'nav.vendors': 'Vendors',
  'nav.reminders': 'Reminders',
  'nav.support': 'Support',
  'nav.admin': 'Admin',
  'nav.logout': 'Log out',

  'common.add': 'Add',
  'common.edit': 'Edit',
  'common.delete': 'Delete',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.search': 'Search…',
  'common.actions': 'Actions',
  'common.empty': 'Nothing here yet.',
  'common.loading': 'Please wait…',
  'common.confirmDelete': 'Delete this item? This cannot be undone.',
  'common.viewAll': 'View all',

  'login.title': 'Login',
  'login.subtitle': 'Enter your mobile number. We will send you a one-time code.',
  'login.phone': 'Mobile number',
  'login.phonePlaceholder': '98765 43210',
  'login.sendOtp': 'Send OTP',
  'login.otpSentTo': 'Code sent to {phone}',
  'login.otp': 'OTP',
  'login.verify': 'Verify & continue',
  'login.changePhone': 'Change number',
  'login.resend': 'Resend OTP',

  'onboarding.title': 'Set up your account',
  'onboarding.subtitle': 'Choose a username and name your shop.',
  'onboarding.username': 'Username',
  'onboarding.shopName': 'Shop name',
  'onboarding.submit': 'Continue',

  'home.greeting': 'Namaskaram, {name}!',
  'home.validTill': 'valid till {date}',
  'home.stocks': 'Products',
  'home.lowStockCount': 'Low stock',
  'home.vendors': 'Vendors',
  'home.lowStock': 'Low stock reminders',
  'home.noReminders': 'All stock levels are fine.',
  'home.createShop': 'Create your shop to get started →',
  'home.whatsappSupport': 'Chat with support on WhatsApp',
  'home.raiseTicket': 'Raise a support ticket',

  'stocks.title': 'Stock',
  'stocks.product_name': 'Product',
  'stocks.qty': 'Quantity',
  'stocks.unit': 'Unit',
  'stocks.low_stock_threshold': 'Low stock limit',

  'vendors.title': 'Vendors',
  'vendors.name': 'Name',
  'vendors.phone': 'Phone',
  'vendors.location': 'Location',

  'reminders.title': 'Reminders',
  'reminders.reminder_date': 'Date',
  'reminders.message': 'Message',
  'reminders.is_read': 'Read',
  'reminders.markRead': 'Mark read',

  'purchases.title': 'Purchases',
  'purchases.purchase_date': 'Date',
  'purchases.vendor_id': 'Vendor',
  'purchases.total_price': 'Total',
  'purchases.scan': 'Add bill',
  'purchases.photo': 'Bill photo',
  'purchases.photoHint': 'Tap to take or choose a photo',
  'purchases.scanQr': 'Scan bill QR',
  'purchases.stopQr': 'Stop scanning',
  'purchases.qrRead': 'QR captured',
  'purchases.items': 'Items',
  'purchases.itemName': 'Item',
  'purchases.itemQty': 'Qty',
  'purchases.itemRate': 'Rate',
  'purchases.addItem': 'Add item',
  'purchases.subtotal': 'Subtotal',

  'support.title': 'Support tickets',
  'support.created_at': 'Date',
  'support.issue_type': 'Issue',
  'support.description': 'Details',
  'support.status': 'Status',

  'admin.settings': 'Settings',
  'admin.adminPhones': 'Admin phones',
  'admin.messages': 'Texts & messages',
  'admin.roles': 'Roles',
  'admin.pricing': 'Pricing plans',
  'admin.shops': 'Shops',
  'admin.users': 'Users',
  'admin.tickets': 'Tickets',

  'settings.title': 'Settings',
  'settings.key': 'Key',
  'settings.value': 'Value (JSON)',
  'settings.visibility': 'Visible to',
  'settings.description': 'Description',
  'settings.visibility.public': 'Everyone',
  'settings.visibility.authenticated': 'Signed-in users',
  'settings.visibility.admin': 'Admins only',

  'roles.title': 'Roles',
  'roles.name': 'Name',
  'roles.description': 'Description',
  'roles.permissions': 'Permissions (JSON)',

  'pricing.title': 'Pricing plans',
  'pricing.name': 'Plan',
  'pricing.price': 'Price',
  'pricing.duration_days': 'Days',
  'pricing.features': 'Features (JSON list)',
  'pricing.is_active': 'Active',
  'pricing.sort_order': 'Order',

  'shops.title': 'Shops',
  'shops.name': 'Shop',
  'shops.subscription_plan_id': 'Plan',
  'shops.subscription_expires_at': 'Valid till',
  'shops.is_test': 'Test',
  'shops.created_at': 'Created',

  'users.title': 'Users',
  'users.phone': 'Phone',
  'users.username': 'Username',
  'users.role_id': 'Role',
  'users.shop_id': 'Shop',
  'users.is_test': 'Test',

  'tickets.title': 'Support tickets',
  'tickets.created_at': 'Date',
  'tickets.issue_type': 'Issue',
  'tickets.description': 'Details',
  'tickets.status': 'Status',

  'adminPhones.title': 'Admin phones',
  'adminPhones.hint': 'People logging in with these numbers get the admin role. Changes apply immediately.',
  'adminPhones.placeholder': 'Mobile number',
  'adminPhones.removeSelf': 'This is your own number. You will lose admin access. Continue?',

  'messages.title': 'Texts & messages',
  'messages.UI_LABELS': 'Screen labels',
  'messages.TOAST_MESSAGES': 'Pop-up messages',
  'messages.REMINDER_MESSAGES': 'Reminder texts',
  'messages.newKey': 'New key',
  'messages.newValue': 'Text',
  'messages.discard': 'Discard unsaved changes?',
};

const toasts = {
  test: 'Everything is wired up.',
  offline: 'You are offline. Changes will sync when you reconnect.',
  online: 'Back online.',
  otpSent: 'OTP sent.',
  loginSuccess: 'Welcome!',
  loginFailed: 'Wrong or expired OTP. Try again.',
  logout: 'Logged out.',
  onboardingDone: 'All set!',
  username_taken: 'That username is taken. Try another.',
  saved: 'Saved.',
  deleted: 'Deleted.',
  error: 'Something went wrong. Please try again.',
  required: 'Please fill all required fields.',
  invalidJson: 'Value is not valid JSON.',
  permissionDenied: 'You do not have access to that page.',
  qrRead: 'QR code read.',
  scanSaved: 'Bill saved.',
  scanFailed: 'Could not save the bill.',
  adminPhonesEmpty: 'Keep at least one admin phone.',
};

const theme = {
  light: {
    primary: '#FFC107', onPrimary: '#1F1300', background: '#FFF8E1', surface: '#FFFFFF',
    border: '#F3E3B5', text: '#3E2723', muted: '#8D6E63',
    success: '#2E7D32', error: '#C62828', warning: '#EF6C00', info: '#1565C0',
  },
  dark: {
    primary: '#FFC107', onPrimary: '#1F1300', background: '#17130C', surface: '#241E14',
    border: '#3A3021', text: '#FFF8E1', muted: '#BCAAA4',
    success: '#66BB6A', error: '#EF5350', warning: '#FFA726', info: '#42A5F5',
  },
};

const icons = [72, 96, 128, 144, 152, 192, 384, 512]
  .map((s) => ({ src: `icons/icon-${s}x${s}.png`, sizes: `${s}x${s}`, type: 'image/png', purpose: 'any' }))
  .concat(
    [192, 512].map((s) => ({ src: `icons/maskable-${s}x${s}.png`, sizes: `${s}x${s}`, type: 'image/png', purpose: 'maskable' })),
  );

// [key, value, visibility, description]
const SETTINGS = [
  ['APP_NAME', 'Khata', 'public', 'App name in header, title and install prompt'],
  ['APP_SHORT_NAME', 'Khata', 'public', 'Home-screen name'],
  ['APP_DESCRIPTION', 'Shop khata, stock and vendor book', 'public', 'PWA description'],
  ['APP_LOGO_URL', 'favicon.svg', 'public', 'Header logo path or URL'],
  ['APP_ICONS', icons, 'public', 'PWA manifest icons'],
  ['BRAND', { name: 'Spread Apps', url: 'https://spreadapps.in', logoUrl: 'brand/spreadapps-logo.svg' }, 'public', 'Footer credit'],
  ['THEME_COLORS', theme, 'public', 'Light/dark palettes; each key becomes a --app-* CSS variable'],
  ['UI_LABELS', labels, 'public', 'Every text on screen'],
  ['TOAST_MESSAGES', toasts, 'public', 'Pop-up message texts'],
  ['TOAST_DURATION_MS', 3500, 'public', 'How long pop-ups stay (ms)'],
  ['LOCALE', 'en-IN', 'public', 'Number/date format'],
  ['CURRENCY_CODE', 'INR', 'public', 'Currency for prices'],
  ['DEFAULT_COUNTRY_CODE', '+91', 'public', 'Prefix for phone numbers'],
  ['SUPPORT_WHATSAPP_NUMBER', '', 'public', 'WhatsApp support number with country code, e.g. 919876543210'],

  ['IS_TEST_MODE', true, 'authenticated', 'New rows are marked is_test while true'],
  ['LOW_STOCK_DEFAULT_THRESHOLD', 5, 'authenticated', 'Low stock limit for products without their own'],
  ['REMINDER_MESSAGES', { low_stock: '{product} stock takkuva undi: {qty} {unit} (limit {threshold}). Repu order cheyali.' }, 'authenticated', 'Placeholders: {product} {qty} {unit} {threshold}'],
  ['ISSUE_TYPES', ['Login', 'Billing', 'Stock', 'Scanner', 'Other'], 'authenticated', 'Support ticket categories'],
  ['TICKET_STATUSES', ['open', 'in_progress', 'resolved', 'closed'], 'authenticated', 'First one is the status of new tickets'],
  ['PRICE_RULES', { tax_percent: 0, round_to: 1 }, 'authenticated', 'Applied to scanned bills'],
  ['BILLS_BUCKET', 'bills', 'authenticated', 'Storage bucket for bill photos'],
  ['BILL_IMAGE', { max_px: 1600, quality: 0.8 }, 'authenticated', 'Bill photo downscale before upload'],
  ['QR_SCANNER', { fps: 10, qrbox: 250 }, 'authenticated', 'QR scanner camera settings'],

  ['ADMIN_PHONES', [], 'admin', 'Numbers that get ADMIN_ROLE_NAME (digits with country code)'],
  ['ADMIN_ROLE_NAME', 'super_admin', 'admin', 'Role given to ADMIN_PHONES'],
  ['DEFAULT_ROLE_NAME', 'shop_owner', 'admin', 'Role for everyone else'],
  ['DEFAULT_PLAN_NAME', 'Free Trial', 'admin', 'Plan assigned to new shops'],
  ['SMS_PROVIDER', { provider: 'log' }, 'admin', 'log = OTP in send-sms function logs; http = call a provider (see send-sms)'],
  ['OTP_SMS_TEMPLATE', 'Your Khata login code is {otp}', 'admin', 'SMS text; {otp} is replaced'],
  ['STOCK_REMINDER_CRON', '30 3 * * *', 'admin', 'Cron (UTC) for daily stock reminders; 30 3 * * * = 9:00 IST'],
  ['MESSAGE_SETTINGS', ['UI_LABELS', 'TOAST_MESSAGES', 'REMINDER_MESSAGES'], 'admin', 'Maps shown in Texts & messages'],
  ['SETTING_VISIBILITIES', ['public', 'authenticated', 'admin'], 'admin', 'Choices for a setting visibility'],
];

const all = {
  can_access_admin: true,
  can_manage_settings: true,
  can_manage_roles: true,
  can_manage_pricing: true,
  can_manage_shops: true,
  can_manage_users: true,
  can_manage_support: true,
  can_manage_own_shop: true,
};

const ROLES = [
  ['super_admin', 'Full access', all],
  ['shop_owner', 'Runs their own shop', { can_manage_own_shop: true }],
  ['staff', 'Works in a shop', { can_manage_own_shop: true }],
];

// [name, price, duration_days, features, sort_order]
const PLANS = [['Free Trial', 0, 14, ['All features'], 0]];

// ---------------------------------------------------------------------------
// Every label/toast key referenced in the app must exist.
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(`${dir}/${d.name}`) : /\.(ts|html)$/.test(d.name) ? [`${dir}/${d.name}`] : [],
  );
}
const src = walk('src/app').map((f) => readFileSync(f, 'utf8')).join('\n');
const usedLabels = new Set([
  ...[...src.matchAll(/label\('([a-zA-Z_.]+)'/g)].map((m) => m[1]),
  ...[...src.matchAll(/label: '([a-zA-Z_.]+)'/g)].map((m) => m[1]),
  ...[...src.matchAll(/key: '(home\.[a-zA-Z_]+)'/g)].map((m) => m[1]),
]);
const usedToasts = new Set([...src.matchAll(/show\('([a-zA-Z_]+)'/g)].map((m) => m[1]));
const missing = [
  // Keys ending in '.' are prefixes of dynamic keys (e.g. 'messages.' + setting).
  ...[...usedLabels].filter((k) => !k.endsWith('.') && !(k in labels)).map((k) => `UI_LABELS.${k}`),
  ...[...usedToasts].filter((k) => !(k in toasts)).map((k) => `TOAST_MESSAGES.${k}`),
];
if (missing.length) {
  console.error('Missing keys:\n  ' + missing.join('\n  '));
  process.exit(1);
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const j = (v) => `${q(JSON.stringify(v))}::jsonb`;

const sql = [
  '-- Generated by scripts/settings.seed.mjs. Initial data only: "on conflict do nothing",',
  '-- so values admins change later are never overwritten.',
  '',
  ...ROLES.map(
    ([n, d, p]) =>
      `insert into public.roles (name, description, permissions, is_test) values (${q(n)}, ${q(d)}, ${j(p)}, false) on conflict (name) do nothing;`,
  ),
  '',
  ...PLANS.map(
    ([n, price, days, f, o]) =>
      `insert into public.pricing_plans (name, price, duration_days, features, sort_order, is_test) select ${q(n)}, ${price}, ${days}, ${j(f)}, ${o}, false where not exists (select 1 from public.pricing_plans where name = ${q(n)});`,
  ),
  '',
  ...SETTINGS.map(
    ([k, v, vis, d]) =>
      `insert into public.app_settings (key, value, visibility, description) values (${q(k)}, ${j(v)}, ${q(vis)}, ${q(d)}) on conflict (key) do nothing;`,
  ),
  '',
].join('\n');

const out = process.argv[2];
if (out) writeFileSync(out, sql);

const bootstrap = Object.fromEntries(SETTINGS.filter(([, , vis]) => vis === 'public').map(([k, v]) => [k, v]));
writeFileSync('public/config/bootstrap.json', JSON.stringify(bootstrap, null, 2) + '\n');

console.log(
  `labels ${Object.keys(labels).length} (used ${usedLabels.size}), toasts ${Object.keys(toasts).length}, settings ${SETTINGS.length}` +
    (out ? `, wrote ${out}` : ''),
);
