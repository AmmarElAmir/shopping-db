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

**Same item on the other platform.** For tracked products from noon or Amazon.ae,
the routine also looks for the same item on the other site once (recorded in
`products.match_searched_at`), and reports what it finds as `matches` /
`no_matches`. Exact matches (same brand, model number and variant) are stored as
confirmed listings; likely matches are stored as suggestions that Ammar confirms
or rejects on the Price Tracker tab. Every run then checks the price of each
confirmed or suggested listing (`listing_checks` / `listing_failures`). Schema:
`supabase/migrations/20261121000000_cross_platform_listings.sql`.

Alerts are not part of this routine. Price-drop alerts hang off the
`price_history` rows it writes (`source = 'check'`), and the "one day left"
reminder reads `products.tracking_ends_at`.

Replace `<SUPABASE_ANON_KEY>` with the project's anon key (Supabase → Project
Settings → API) when creating the routine.

```
Check current prices for tracked products in the shopping-db Supabase project (irjulzfqobargilnehpm, ap-northeast-1), on the product's own link and on the same item on the other platform (noon <-> Amazon.ae).

This routine runs unattended. It must only READ from Supabase. All database writes go through the `record-prices` edge function (step 5). Never use Supabase tools to insert or update rows.

1. Queries (read-only SELECTs):
   a) Own links:
      select id, name, store, coalesce(product_link, product_url) as link, price, currency
      from products
      where is_tracked = true and tracking_ends_at > now();
      If there are no tracked products, confirm briefly and stop.
   b) Other-platform listings to price:
      select l.id as listing_id, l.product_id, l.store, l.url, l.title, l.match_status, p.name
      from product_listings l join products p on p.id = l.product_id
      where p.is_tracked and p.tracking_ends_at > now() and l.match_status in ('confirmed', 'suggested');
   c) Products that still need a search on the other platform:
      select p.id, p.name, p.store, coalesce(p.product_link, p.product_url) as link, p.price, p.currency, p.description,
             (select array_agg(url) from product_listings r where r.product_id = p.id and r.match_status = 'rejected') as rejected_urls
      from products p
      where p.is_tracked and p.tracking_ends_at > now() and p.match_searched_at is null
        and (coalesce(p.product_link, p.product_url) ~* '(noon\.com|amazon\.|amzn\.)' or p.store ~* '^(noon|amazon)')
        and not exists (select 1 from product_listings l where l.product_id = p.id and l.match_status <> 'rejected');

2. For each product in (a), open its link and read the CURRENT selling price (the price a buyer pays now, including any sale price; not the struck-through "was" price, not a per-unit or instalment price, not a card/promo-code discount) and its currency.
   - Use a scraping tool that can render JS-heavy retail pages (plain WebFetch gets 403'd by noon.com, IKEA, Home Centre) — e.g. the Nimble extract tool with country "AE" and driver "vx8". Amazon pages are very large; prefer markdown output and search it for the price rather than reading the whole page.
   - Amazon: if the product page shows no price ("No featured offers available" / "See All Buying Options" / "Currently unavailable"), open the offers listing for its ASIN (the code after /dp/ in the resolved URL): https://www.amazon.ae/gp/product/ajax/aodAjaxMain/?asin=<ASIN>&pc=dp and use the lowest price for a NEW item (prefer one sold by the brand or Amazon). Only record a failure if that listing has no new offers either.
   - Make sure the page is the same product (same name/variant) as the row. If the link now redirects to a different product or a search page, or the product is out of stock with no price anywhere, record it as a failure with a clear reason. Never guess a price.

3. For each product in (c), search the OTHER platform for the same item: a noon product is searched on Amazon.ae (https://www.amazon.ae/s?k=<query>), an Amazon product on noon (https://www.noon.com/uae-en/search/?q=<query>). Build the query from brand + model number (from the name, description or the product page you opened in step 2), falling back to brand + key name words.
   Open the most promising results (at most 3) and compare with the tracked product: brand, model number / MPN, variant (colour, size, storage, capacity, pack count), and condition (new, not renewed/refurbished, not an accessory or bundle).
   - "exact": brand AND model number AND variant all match (or the title is identical apart from word order). Report it with confidence "exact".
   - "likely": clearly the same product line but you cannot verify the model number or variant (e.g. colour unclear, model code not shown). Report with confidence "likely" and a short note saying what is uncertain.
   - Otherwise (different model, different size/colour, bundle, used, or nothing found): report a no_match with a short reason.
   - Never report a URL listed in rejected_urls.
   - Report the listing's canonical URL (amazon.ae/dp/<ASIN> or the noon /p/ URL without tracking parameters), its title, and its current price read with the same rules as step 2 (leave price out if you cannot read one).

4. For each listing in (b), read its current price with the same rules as step 2. If the listing now shows a different product, a search page, or no price anywhere, record a listing failure with a clear reason.

5. Send ALL results in ONE request with Bash/curl. Write the JSON to /tmp/prices.json first:
   {"checks":[{"product_id":"<products.id>","price":123.45,"currency":"AED"}],
    "failures":[{"product_id":"<products.id>","error":"why no price was found"}],
    "listing_checks":[{"listing_id":"<product_listings.id>","price":119,"currency":"AED"}],
    "listing_failures":[{"listing_id":"<product_listings.id>","error":"why"}],
    "matches":[{"product_id":"<products.id>","store":"amazon","url":"https://www.amazon.ae/dp/B0...","title":"...","price":119,"currency":"AED","confidence":"exact","note":"same model WH-1000XM5, Black"}],
    "no_matches":[{"product_id":"<products.id>","store":"amazon","note":"Only the XM4 is sold on Amazon.ae"}]}
   then:

   curl -sS -X POST https://irjulzfqobargilnehpm.supabase.co/functions/v1/record-prices \
     -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
     -H "content-type: application/json" \
     -d @/tmp/prices.json

6. Read the JSON response: a status per product (results), per listing (listing_results), per search (match_results), and windows_closed. If the request itself fails (network error, non-200), retry once, then stop and report; do not fall back to writing through Supabase tools.
7. Log a summary: products checked, prices recorded (old -> new for any that changed), other-platform matches found (exact / likely / none) and their prices, failures with reasons, and tracking windows closed.

Price-drop and "one day left" notifications are handled by a separate task; do not send any.
```
