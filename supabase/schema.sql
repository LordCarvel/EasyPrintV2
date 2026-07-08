create table if not exists public.stores (
  id text primary key,
  name text not null,
  city text not null default '',
  service_areas jsonb not null default '[]'::jsonb,
  review_areas jsonb not null default '[]'::jsonb,
  receives_orders boolean not null default true,
  auto_print boolean not null default false,
  username text,
  password_hash text,
  password_salt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists stores_username_unique
  on public.stores(username)
  where username is not null;

create table if not exists public.store_connections (
  id text primary key,
  source_store_id text not null references public.stores(id) on delete cascade,
  target_store_id text not null references public.stores(id) on delete cascade,
  can_send_orders boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_store_id, target_store_id)
);

create table if not exists public.orders (
  id text primary key,
  order_number text not null default '',
  customer_name text not null default '',
  source_store_id text not null references public.stores(id),
  target_store_id text not null references public.stores(id),
  raw_text text not null,
  parsed_data jsonb not null default '{}'::jsonb,
  route_result jsonb not null default '{}'::jsonb,
  status text not null,
  created_at timestamptz not null default now(),
  viewed_at timestamptz,
  printed_at timestamptz,
  canceled_at timestamptz
);

create index if not exists orders_source_store_created_idx
  on public.orders(source_store_id, created_at desc);

create index if not exists orders_target_store_created_idx
  on public.orders(target_store_id, created_at desc);

create table if not exists public.order_events (
  id text primary key,
  order_id text not null references public.orders(id) on delete cascade,
  type text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists order_events_order_created_idx
  on public.order_events(order_id, created_at);

create table if not exists public.store_sessions (
  token text primary key,
  store_id text not null references public.stores(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists store_sessions_store_idx
  on public.store_sessions(store_id);

create table if not exists public.store_settings (
  store_id text primary key references public.stores(id) on delete cascade,
  keywords jsonb not null default '[]'::jsonb,
  catalogs jsonb not null default '[]'::jsonb,
  print_template jsonb not null default '{}'::jsonb,
  cash_orders jsonb not null default '[]'::jsonb,
  cash_processed jsonb not null default '[]'::jsonb,
  delivery_board_state jsonb not null default '{}'::jsonb,
  finally_storage_state jsonb not null default '{}'::jsonb,
  finally_storage_preview jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.stores enable row level security;
alter table public.store_connections enable row level security;
alter table public.orders enable row level security;
alter table public.order_events enable row level security;
alter table public.store_sessions enable row level security;
alter table public.store_settings enable row level security;

grant usage on schema public to service_role;
grant all on public.stores to service_role;
grant all on public.store_connections to service_role;
grant all on public.orders to service_role;
grant all on public.order_events to service_role;
grant all on public.store_sessions to service_role;
grant all on public.store_settings to service_role;
