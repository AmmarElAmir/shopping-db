# "Shopping DB price alerts" scheduled task

Delivers price tracker alerts to Ammar. It runs about 15 minutes after each
price check: **10:15, 14:15 and 17:15 Asia/Dubai** (cron `15 6,10,13 * * *`
in UTC), and is a scheduled task inside the Price Tracking Claude project, so
its messages land in that project and reach Ammar as normal Claude app
notifications.

Like the submissions routine, it only makes HTTP calls: every write goes
through the `price-alerts` edge function
(`supabase/functions/price-alerts/index.ts`). Replace `<SUPABASE_ANON_KEY>`
with the project's anon key.

## Setup

1. Apply `supabase/migrations/20261118000100_price_alerts.sql` (after
   `20261118000000_price_tracking.sql`).
2. `supabase functions deploy price-alerts` (JWT verification stays on).
3. Create the scheduled task with the prompt below.

## How "extend" works

The one-day-left alert offers two ways to add 7 days:

- Reply **extend** (or "extend all", or name a product) in the project.
  Claude calls `price-alerts` with `{"action":"extend", ...}`.
- Tap **+7 days** on the product in the Price Tracker tab (`/price-tracker`).

## Prompt

```
Deliver price tracker alerts for the shopping-db project (Supabase irjulzfqobargilnehpm).

This task runs unattended. Do not use Supabase tools. Make only these HTTP calls with Bash/curl.

1. Collect pending alerts:

   curl -sS -X POST https://irjulzfqobargilnehpm.supabase.co/functions/v1/price-alerts \
     -H "Authorization: Bearer <SUPABASE_ANON_KEY>" -H "content-type: application/json" \
     -d '{"action":"collect"}'

   If the call fails, retry once. If it still fails, post one short message saying alerts could not be fetched and the error, then stop.

2. If "alerts" is empty, stop without posting anything.

3. Otherwise post ONE message to Ammar covering all alerts, price drops first. Show times in Dubai time (Asia/Dubai). For each alert:
   - price_drop: "<name> dropped to <new_price> <currency> (was lowest <old_price>)", with the store and the product link.
   - tracking_ending: "<name>: tracking ends <tracking_ends_at in Dubai time>. Current price <new_price> <currency>, lowest seen <lowest_price>."
   If there are any tracking_ending alerts, end with: "Reply 'extend' to add 7 days to all of these, or name the ones to extend. You can also tap +7 days on the Price Tracker tab: https://<site>/price-tracker"
   Keep the alert ids and product ids in your own notes so a later reply can extend the right products.

4. Only after the message is posted, acknowledge the alerts so they are not sent again:

   curl -sS -X POST https://irjulzfqobargilnehpm.supabase.co/functions/v1/price-alerts \
     -H "Authorization: Bearer <SUPABASE_ANON_KEY>" -H "content-type: application/json" \
     -d '{"action":"ack","alert_ids":["<id>", "..."]}'

When Ammar replies to extend:
   - "extend" or "extend all": -d '{"action":"extend","all_ending":true}'
   - specific products: -d '{"action":"extend","product_ids":["<product_id>", "..."]}'
   Then confirm the new end date for each product, in Dubai time.
```
