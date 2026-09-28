# Khata (khata.spreadapps.in)

Angular 22 PWA + Tailwind CSS 4 + Supabase + Netlify. Every value (app name, theme colors,
labels, toast texts, thresholds, pricing, admin phones) is admin-managed in the
`app_settings` table. `src/environments/environment.ts` only holds the Supabase URL and anon key.

## Run

```bash
npm install
npm start            # http://localhost:4200
npm run build        # dist/khatabk/browser
npm test
```

## How settings load

`provideAppInitializer(initApp)` runs before the first render:

1. `ConfigService.load()` calls the `config-loader` edge function. Until Supabase is
   connected (or if it fails), it reads `public/config/bootstrap.json`, which is the same
   data the Phase 2 migration seeds into `app_settings`.
2. `ThemeService.apply()` writes `THEME_COLORS` to `--app-*` CSS variables. `styles.css`
   maps them to Tailwind colors (`bg-primary`, `text-muted`, ...), so components hold no colors.
3. `PwaService.apply()` rebuilds the web manifest and title from `APP_NAME` / `THEME_COLORS`.

Text in templates goes through `config.label('key')` (`UI_LABELS`) and
`toast.show('key')` (`TOAST_MESSAGES`).

## Layout

```
src/app/core/services   supabase, config, encryption, network, toast, theme, pwa
src/app/core/types      app-settings.ts, supabase.ts (generated in Phase 2)
src/app/features        routed pages
src/app/shared          reusable components
supabase/migrations     SQL migrations (Phase 2)
supabase/functions      encrypt-rpc, config-loader, stock-reminder-cron, vendor-scan (stubs return 501)
```

## Deploy

Netlify (`netlify.toml`): build `npm run build`, publish `dist/khatabk/browser`.

GitHub Actions:
- `ci-deploy.yml`: build + test on every PR/push; deploys PR previews and production on `main`.
  Repo secrets: `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`.
- `supabase.yml`: on `supabase/**` changes to `main`, runs `db push` and `functions deploy`.
  Repo secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`.
  Skips until they are set.

Local CLI shortcuts: `npm run netlify:deploy[:prod]`, `npm run supabase:link`,
`npm run supabase:push`, `npm run supabase:functions`, `npm run supabase:types`.

## Note: Console Ninja

The Console Ninja VS Code extension injects a debug script into `src/index.html`.
`npm run check:index` (also run before every build and in CI) fails if that happens.
