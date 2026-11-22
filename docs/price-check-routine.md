# "Shopping DB price check" routine

Checks the current price of every product with tracking on, three times a day:
**09:39, 13:39 and 16:39 Asia/Dubai** (`CRON_TZ=Asia/Dubai 39 9,13,16 * * *`,
slightly early to dodge on-the-hour load). One scheduled task does both the own-link
prices and the noon <-> Amazon.ae work (merged 2026-11-22).

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

**Keeping runs cheap.** The run starts with `{"action":"plan"}` on `record-prices`,
which returns the whole worklist with the exact URL to fetch for each item, so the
run needs no Supabase reads. Amazon items with a known ASIN go straight to the
offers listing (`aodAjaxMain`), which loads reliably with Nimble's fast vx6
driver. A short `amzn.eu` link is resolved once; the run sends `resolved_url`
and the function stores `amazon.ae/dp/<ASIN>` in `products.product_url` (the
legacy alias; `product_link` still wins in the app). Products already searched
on the other platform (`match_searched_at`) are never searched again, and a
search first checks tracked products already on the other platform
(`candidates`) before opening a search page.

Replace `<SUPABASE_ANON_KEY>` with the project's anon key (Supabase → Project
Settings → API) when creating the task.

```
Price check for tracked products in the shopping-db Supabase project (irjulzfqobargilnehpm): each product's own link, plus the same item on the other platform (noon <-> Amazon.ae). Unattended run; keep it lean.

Rules: never write through Supabase tools; all writes go through the record-prices function. Use only Bash/curl and the Nimble extract tool (country "AE"); Supabase tools only for the read-only fallback in step 1. No subagents, no re-reading pages you already have.

FN=https://irjulzfqobargilnehpm.supabase.co/functions/v1/record-prices
KEY=<SUPABASE_ANON_KEY>

1. Get the plan:
   curl -sS -X POST $FN -H "Authorization: Bearer $KEY" -H "content-type: application/json" -d '{"action":"plan"}'
   It returns products[], listings[], searches[]; each item has fetch_url and a "read" hint. If all three are empty, say so in one line and stop. If the call fails, retry once, then stop and report.
   Fallback, only if the response has no "products" key (older function): build the same lists with read-only Supabase SELECTs on project irjulzfqobargilnehpm:
     products: select id, name, store, product_link, product_url, price from products where is_tracked and tracking_ends_at > now();
     listings: select l.id, l.product_id, l.store, l.url, l.match_status from product_listings l join products p on p.id = l.product_id where p.is_tracked and p.tracking_ends_at > now() and l.match_status in ('confirmed','suggested');
     searches: tracked noon/Amazon products with match_searched_at null and no non-rejected listing (rejected listing URLs = rejected_urls; candidates = tracked products on the other platform).
     fetch_url: Amazon with an ASIN in product_link or product_url (/dp/<ASIN>) -> https://www.amazon.ae/gp/product/ajax/aodAjaxMain/?asin=<ASIN>&pc=dp; noon -> the link; search_url -> https://www.amazon.ae/s?k=<brand model> or https://www.noon.com/uae-en/search/?q=<brand model>.

2. Price every item in products[] and listings[]: open fetch_url once and follow its "read" hint.
   - Nimble settings: noon pages driver "vx8", output_format "markdown"; read the JSON-LD "offers" price (a second price in that blob is the struck-through one). Amazon offers listing (aodAjaxMain) driver "vx6", output_format "plain_text" (use "vx8" only if empty); take the lowest NEW offer, preferring one sold by the brand or Amazon. Amazon short link (amzn.eu) with no ASIN: open it once (vx6, plain_text), take the ASIN from the /dp/ URL, then read its offers listing, and send resolved_url with the check. Search the output for the price; do not read the whole page.
   - Price = the CURRENT selling price a new buyer pays now (sale price included); not the struck-through price, per-unit, instalment or card/coupon discount. Never guess.
   - Check the page is the same item (name/variant). If it redirected to another product or a search page, or there is no price anywhere (out of stock / no new offers), report a failure with a clear reason.
   - If a nudge like "Only N left in stock" is shown, add a short "stock" note for the summary.
   - If a Nimble call times out, retry once with the next driver (vx8 -> vx10), then report a failure.

3. For each item in searches[] (one-time search on the other platform):
   - First look at its candidates (tracked products already on that platform). If one is clearly the same item (brand, model, variant/colour, new), report it as a match with that candidate's url and the price you read for it in step 2. No search needed.
   - Otherwise open search_url once (noon vx8 markdown; Amazon vx8 markdown) and judge from the result titles; open at most 2 result pages, only when the title can't settle model or variant.
   - "exact" = brand + model number + variant all match -> confidence "exact". "likely" = same product line, model/variant unverified -> confidence "likely" with a note saying what is uncertain ("Same item?" is then asked on the Price Tracker tab). Anything else (other model/size/colour, bundle, used, nothing found) -> no_match with a short reason. Never report a URL in rejected_urls.
   - Report the canonical URL (amazon.ae/dp/<ASIN> or the noon /p/ URL without tracking parameters), title, and price if shown.

4. Send ALL results in ONE request. Write /tmp/prices.json (omit empty arrays):
   {"checks":[{"product_id":"...","price":123.45,"currency":"AED","resolved_url":"https://www.amazon.ae/dp/B0... (only for Amazon short links you resolved)"}],
    "failures":[{"product_id":"...","error":"why"}],
    "listing_checks":[{"listing_id":"...","price":119,"currency":"AED"}],
    "listing_failures":[{"listing_id":"...","error":"why"}],
    "matches":[{"product_id":"...","store":"amazon","url":"https://www.amazon.ae/dp/B0...","title":"...","price":119,"currency":"AED","confidence":"exact","note":"same model, Graphite"}],
    "no_matches":[{"product_id":"...","store":"amazon","note":"why"}]}
   ("store" is where the listing is.) Then:
   curl -sS -X POST $FN -H "Authorization: Bearer $KEY" -H "content-type: application/json" -d @/tmp/prices.json
   Retry once on a network error or non-200, then stop and report.

5. Summary (short): prices recorded with old -> new where changed, other-platform matches (exact / likely / none), stock notes, failures with reasons, windows_closed.

Drop alerts, "one day left" reminders, web push and project-chat posts are sent by the separate "Price tracker alerts" task a few minutes later from what this run records; do not send any yourself.
```
