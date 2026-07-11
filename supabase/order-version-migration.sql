alter table public.orders
  add column if not exists version integer not null default 1;

alter table public.orders
  add column if not exists updated_at timestamptz not null default now();

update public.orders
set updated_at = coalesce(updated_at, created_at, now()),
    version = coalesce(version, 1)
where updated_at is null
   or version is null;

alter table public.order_events
  add column if not exists updated_at timestamptz not null default now();

update public.order_events
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.store_settings
  add column if not exists sent_cash_cleared_at timestamptz;

notify pgrst, 'reload schema';
