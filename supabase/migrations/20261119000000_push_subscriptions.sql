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

-- VAPID keys for sending pushes, read by the edge function with the service
-- role. No policies, so the anon key cannot read it. Function secrets
-- (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT) take precedence.
-- The row itself is inserted out of band, never committed to git.
create table if not exists push_config (
  id int primary key default 1 check (id = 1),
  vapid_public_key text not null,
  vapid_private_key text not null,
  vapid_subject text
);
alter table push_config enable row level security;
