-- Units a shop added on top of the app-wide UNITS setting (e.g. "tray", "bundle").
alter table public.shops add column if not exists custom_units jsonb not null default '[]'::jsonb;
