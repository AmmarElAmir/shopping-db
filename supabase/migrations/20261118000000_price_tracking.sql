-- Opt-in price tracking.
--
-- Tracking is OFF for every product by default. Turning it on (from a product
-- card or the Price Tracker tab) sets is_tracked = true and opens a tracking
-- window (tracking_ends_at, 7 days from now). A scheduled Claude task checks
-- each tracked product's price at 10:00, 14:00 and 17:00 Asia/Dubai and
-- reports results to the `record-prices` edge function, which writes them here.

alter table products add column if not exists is_tracked boolean not null default false;
alter table products add column if not exists tracking_started_at timestamptz;
alter table products add column if not exists tracking_ends_at timestamptz;
alter table products add column if not exists lowest_price numeric(12,2);
alter table products add column if not exists lowest_price_at timestamptz;
alter table products add column if not exists last_checked_at timestamptz;
alter table products add column if not exists last_check_error text;
-- Set when the "1 day left" alert has gone out for the current window, so it
-- is sent once. Cleared whenever the window is extended or restarted.
alter table products add column if not exists ending_alert_sent_at timestamptz;

create index if not exists idx_products_tracked on products(is_tracked);

-- One row per observed price (the baseline when tracking starts, then every
-- scheduled check).
create table if not exists price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  price numeric(12,2) not null,
  currency text,
  source text not null default 'check' check (source in ('baseline', 'check')),
  checked_at timestamptz not null default now()
);

create index if not exists idx_price_history_product on price_history(product_id, checked_at);

-- Same open posture as the rest of this no-login tool: the site reads history
-- and writes the baseline row when tracking is turned on.
alter table price_history enable row level security;

drop policy if exists "public read price history" on price_history;
create policy "public read price history" on price_history for select using (true);
drop policy if exists "public insert price history" on price_history;
create policy "public insert price history" on price_history for insert with check (true);
