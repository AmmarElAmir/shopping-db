-- Browser push notifications for price tracker alerts.
--
-- Each browser/device that turns on notifications on the site stores its Web
-- Push subscription here (through the `price-alerts` edge function, so the
-- table needs no public policies). When the alert job collects new alerts it
-- sends a push to every subscription and stamps price_alerts.pushed_at, so a
-- given alert is pushed once.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error text
);

-- No policies: only the service role (edge function) reads or writes this.
alter table push_subscriptions enable row level security;

alter table price_alerts add column if not exists pushed_at timestamptz;
