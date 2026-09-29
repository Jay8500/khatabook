# Khata (khata.spreadapps.in)

Angular 22 PWA + Tailwind CSS 4 + Supabase + Netlify. Every value (app name, theme colors,
labels, toast texts, thresholds, pricing, admin phones, SMS provider, cron time) is managed in
the database and edited from the admin panel. `src/environments/environment.ts` only holds the
Supabase URL and publishable key.

## Run

```bash
npm install
npm start            # http://localhost:4200 (uses the live Supabase project)
npm run build        # dist/khatabk/browser
npm test
```

## How it fits together

**Startup** (`core/app-init.ts`, before first render):

1. `ConfigService.load()` calls the `config-loader` edge function, which returns the
   `app_settings` rows the caller may see (`visibility`: public / authenticated / admin).
   Offline or on failure it falls back to `public/config/bootstrap.json`.
2. `ThemeService` writes `THEME_COLORS` to `--app-*` CSS variables; `styles.css` maps them to
   Tailwind colors (`bg-primary`, `text-muted`, ...). Components hold no colors.
3. `PwaService` rebuilds the manifest from `APP_NAME`, `APP_ICONS`, `THEME_COLORS`.
4. `AuthService.init()` restores the Supabase session and loads `get_my_context`
   (profile, role permissions, shop). The theme follows `users_profile.preferences.theme`.

**Access** is decided by `roles.permissions` (jsonb), never by role names:
`can_access_admin`, `can_manage_settings`, `can_manage_roles`, `can_manage_pricing`,
`can_manage_shops`, `can_manage_users`, `can_manage_support`, `can_manage_own_shop`.
Route guards (`core/guards.ts`) and Postgres RLS policies check the same keys.

**Who is admin**: phones listed in `app_settings.ADMIN_PHONES` get the role named in
`ADMIN_ROLE_NAME`; everyone else gets `DEFAULT_ROLE_NAME`. Editing the list (Admin → Admin
phones) promotes/demotes users immediately (database trigger). The list can never be empty.

**Data calls** go through `SupabaseService.callSecureRpc()`: the payload is AES-GCM encrypted
with `ENCRYPTION_KEY` (sent by `config-loader` to signed-in users), the `encrypt-rpc` edge
function decrypts it and runs the RPC **as the user**, so RLS applies. Screens use
`CrudService` → `crud_list` / `crud_upsert` / `crud_update` / `crud_delete` over an allow-list of
tables. Note: the key reaches the browser, so this hides payloads from casual inspection; the
actual protection is RLS + auth.

**Screens** are mostly data: `shared/entities.ts` declares each table screen (fields, types,
options); `shared/crud-page` renders grid + form. Custom screens: login, onboarding, dashboard,
purchases (bill photo + QR scan), admin phones, texts & messages.

**Texts**: `config.label('key')` reads `UI_LABELS`, `toast.show('key')` reads `TOAST_MESSAGES`.
Edit them in Admin → Texts & messages.

## Supabase

```
supabase/migrations/   schema, RLS, RPCs, cron, seed (run: npm run supabase:push)
supabase/functions/
  config-loader        settings by visibility (+ ENCRYPTION_KEY for signed-in users)
  encrypt-rpc          decrypt -> rpc as user -> encrypt
  send-sms             Auth "Send SMS" hook; provider from app_settings.SMS_PROVIDER
  stock-reminder-cron  daily; pg_cron schedule from app_settings.STOCK_REMINDER_CRON
  vendor-scan          bill photo upload + QR items + PRICE_RULES -> vendor_purchases
scripts/settings.seed.mjs  source of the seed migration and bootstrap.json; fails if a label
                           or toast key used in the app is missing
```

Function secrets (`ENCRYPTION_KEY`, `CRON_SECRET`, `SEND_SMS_HOOK_SECRET`) live in the gitignored
`supabase/.env` and are set with `npx supabase secrets set --env-file supabase/.env`.
Vault holds `project_url` and `cron_secret` for the cron job.

**Login OTPs**: `SMS_PROVIDER = {"provider":"inbox"}` (default) stores each OTP in `login_codes`;
admins see it in Admin → Login codes and send it on WhatsApp. Codes are deleted on expiry
(`LOGIN_CODE_MINUTES`) or when that phone signs in. `"log"` only writes to the send-sms function
logs. For real SMS set
`{"provider":"http", "url":..., "headers":..., "body":...}` using `{{phone}}`, `{{otp}}`,
`{{message}}` and `{{env:API_KEY_NAME}}` (a function secret).

Test phone numbers (`[auth.sms.test_otp]`) cannot be removed with `config push`; clear
`sms_test_otp` via the dashboard or Management API.

## Store and orders (Phase 3A)

- Every shop has a public store at `/s/<slug>` and a join code (`/join` finds a shop by code or
  phone). Browsing uses the public `store_get` / `store_find` RPCs (plain `rpc`, no login).
- People who sign up from a shop link get `CUSTOMER_ROLE_NAME` (via `signup_as` user metadata).
- Cart lives in browser storage per shop; `order_place` re-checks items, prices and stock.
- Status flow: requested → accepted → packed → ready → completed (or rejected / cancelled).
  Accept reserves stock (`stocks.reserved_qty`), completion deducts it, cancel releases it.
- Payment: shop picks full / advance / COD on accept; customers pay by UPI link/QR and report
  it; the shop confirms. Every step can carry a remark (`order_events`).
- Owner screens: Orders (`/shop-orders`, badge for new requests) and My store (`/my-store`).
  Customer screens: My orders (`/orders`), order detail (`/orders/:id`, shared by both sides).

## Version

The version shown on the profile page comes from `package.json` (`major.minor.patch`) plus
the git commit, via `scripts/build-info.mjs` (runs before start/build/test). Bump it with
`npm version patch` (fixes), `npm version minor` (features) or `npm version major`.

## Deploy

Netlify (`netlify.toml`): build `npm run build`, publish `dist/khatabk/browser`.

GitHub Actions:
- `ci-deploy.yml`: build + test on every PR/push; PR previews and production on `main`.
  Secrets: `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`.
- `supabase.yml`: on `supabase/**` changes to `main`, runs `db push` and `functions deploy`.
  Secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`. Skips until set.

Scripts: `netlify:deploy[:prod]`, `supabase:link`, `supabase:push`, `supabase:functions`,
`supabase:types`, `seed:settings`.

## Note: Console Ninja

The Console Ninja VS Code extension injects a debug script into `src/index.html`.
`npm run check:index` (run before every build and in CI) fails if that happens.
