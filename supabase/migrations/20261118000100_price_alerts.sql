-- Price tracker alerts.
--
-- Depends on 20261118000000_price_tracking.sql (products.is_tracked,
-- tracking_ends_at, ending_alert_sent_at, and the price_history table).
--
-- Two kinds of alert, both written here and delivered by the scheduled
-- "Shopping DB price alerts" Claude task through the `price-alerts` edge
-- function:
--   price_drop      a scheduled check found a price below the lowest price
--                   seen so far for that product (written by the trigger
--                   below, so the price-check job needs no alert code).
--   tracking_ending a tracked product has 24 hours or less left in its 7-day
--                   window (written by the `price-alerts` function, once per
--                   window, guarded by products.ending_alert_sent_at).

create table if not exists price_alerts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  kind text not null check (kind in ('price_drop', 'tracking_ending')),
  old_price numeric(12,2),          -- price_drop: previous lowest seen price
  new_price numeric(12,2),          -- price_drop: the new low; tracking_ending: current price
  currency text,
  tracking_ends_at timestamptz,     -- the window end this alert refers to
  price_history_id uuid references price_history(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz               -- set once the alert has been delivered
);

create index if not exists idx_price_alerts_unsent on price_alerts(created_at) where sent_at is null;
create index if not exists idx_price_alerts_product on price_alerts(product_id, created_at);

-- Only the edge function (service role) writes alerts; the site can read them.
alter table price_alerts enable row level security;
drop policy if exists "public read price alerts" on price_alerts;
create policy "public read price alerts" on price_alerts for select using (true);

-- Record a price_drop alert whenever a scheduled check lands below the lowest
-- price seen before it. The previous lowest comes from price_history itself
-- (baseline included), so it does not matter whether the writer updates
-- products.lowest_price before or after inserting the history row.
create or replace function record_price_drop_alert() returns trigger as $$
declare
  prev_lowest numeric(12,2);
  tracked boolean;
  ends_at timestamptz;
begin
  if new.source is distinct from 'check' then
    return new;
  end if;

  select is_tracked, tracking_ends_at into tracked, ends_at
  from products where id = new.product_id;
  if not coalesce(tracked, false) then
    return new;
  end if;

  select min(price) into prev_lowest
  from price_history
  where product_id = new.product_id and id <> new.id;

  if prev_lowest is not null and new.price < prev_lowest then
    insert into price_alerts (product_id, kind, old_price, new_price, currency, tracking_ends_at, price_history_id)
    values (new.product_id, 'price_drop', prev_lowest, new.price, new.currency, ends_at, new.id);
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_price_history_drop_alert on price_history;
create trigger trg_price_history_drop_alert
after insert on price_history
for each row execute function record_price_drop_alert();
