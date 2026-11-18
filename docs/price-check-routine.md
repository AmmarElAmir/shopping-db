# "Shopping DB price check" routine

Checks the current price of every product with tracking on, three times a day:
**10:00, 14:00 and 17:00 Asia/Dubai** (cron `0 6,10,13 * * *` in UTC; Dubai has
no daylight saving, so this never drifts).

It runs as a scheduled Claude routine rather than pg_cron plus an edge-function
fetch, because the stores in this catalog (noon, IKEA, Home Centre, HomeBox)
block plain server-side fetches; the routine scrapes with Nimble, the same way
the submissions processor does (see `docs/routine-prompt.md`).

Like that routine, it only **reads** from Supabase. Every write goes through the
`record-prices` edge function (`supabase/functions/record-prices/index.ts`,
deployed with JWT verification on).

Which products: `products.is_tracked = true and tracking_ends_at > now()`.
Turning tracking on (Price Tracker tab) opens a 7-day window; the function
switches `is_tracked` off once `tracking_ends_at` has passed.

Alerts are not part of this routine. Price-drop alerts hang off the
`price_history` rows it writes (`source = 'check'`), and the "one day left"
reminder reads `products.tracking_ends_at`.

Replace `<SUPABASE_ANON_KEY>` with the project's anon key (Supabase → Project
Settings → API) when creating the routine.

```
Check current prices for tracked products in the shopping-db Supabase project (irjulzfqobargilnehpm, ap-northeast-1).

This routine runs unattended. It must only READ from Supabase. All database writes go through the `record-prices` edge function (step 3). Never use Supabase tools to insert or update rows.

1. Query (read-only SELECT):
   select id, name, store, coalesce(product_link, product_url) as link, price, currency
   from products
   where is_tracked = true and tracking_ends_at > now();
   If there are none, confirm briefly and stop.
2. For each product, open its link and read the CURRENT selling price (the price a buyer pays now, including any sale price; not the struck-through "was" price, not a per-unit or instalment price) and its currency.
   - Use a scraping tool that can render JS-heavy retail pages (plain WebFetch gets 403'd by noon.com, IKEA, Home Centre) — e.g. the Nimble extract tool.
   - Make sure the page is the same product (same name/variant) as the row. If the link now redirects to a different product, a search page, or says out of stock with no price, record it as a failure with a clear reason. Never guess a price.
3. Send ALL results in ONE request:

   curl -sS -X POST https://irjulzfqobargilnehpm.supabase.co/functions/v1/record-prices \
     -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
     -H "content-type: application/json" \
     -d @/tmp/prices.json

   where /tmp/prices.json is:
   {"checks":[{"product_id":"<products.id>","price":123.45,"currency":"AED"}],
    "failures":[{"product_id":"<products.id>","error":"why no price was found"}]}

4. Read the JSON response: a status per product (recorded / failed / skipped) and windows_closed. If the request itself fails (network error, non-200), retry once, then stop and report; do not fall back to writing through Supabase tools.
5. Log a summary: products checked, prices recorded (old → new for any that changed), failures with reasons, and windows closed.
```
