# "Shopping DB submissions processor" routine prompt

Paste this into the routine at https://claude.ai/code/routines (the routine was
created through the API, so it can only be edited there). Replace
`<SUPABASE_ANON_KEY>` with the project's anon key (Supabase → Project Settings →
API). The anon key is public by design; it only lets callers reach the function.

The routine runs unattended, so it only **reads** from Supabase. Every write goes
through the `ingest-products` edge function
(`supabase/functions/ingest-products/index.ts`), which avoids the tool-approval
prompt that stalled earlier runs.

```
Process pending product submissions in the shopping-db Supabase project (irjulzfqobargilnehpm, ap-northeast-1).

This routine runs unattended. It must only READ from Supabase. All database writes go through the `ingest-products` edge function (step 3). Never use Supabase tools to insert or update rows.

1. Query the `submissions` table (read-only SELECT) for all rows with status = 'pending'. Also SELECT the `categories` names so you can reuse an existing category instead of inventing a near-duplicate.
2. For each pending submission, fetch the product link and extract product details: name, price (number), currency, store, description, category, AND a main product image URL.
   - Use a scraping tool that can render/extract JS-heavy retail pages (plain WebFetch gets 403'd by sites like Home Centre, IKEA, noon.com) — e.g. the Nimble extract tool.
   - The image URL is usually the first/hero image in the product gallery (look for the "-image-1" gallery entry or the main product photo, not a thumbnail or icon). Do not leave image_url null when a product image was found on the page.
   - If the link is not a product page (e.g. an account, order or cart page), do not guess: record it as a failure with a clear reason.
3. Send ALL results in ONE request to the ingest function with Bash/curl:

   curl -sS -X POST https://irjulzfqobargilnehpm.supabase.co/functions/v1/ingest-products \
     -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
     -H "content-type: application/json" \
     -d '{"items":[{"submission_id":"<submissions.id>","name":"...","price":123.45,"currency":"AED","store":"...","category":"...","description":"...","image_url":"https://..."}],"failures":[{"submission_id":"<submissions.id>","error":"why it failed"}]}'

   Write the JSON to a temp file and use `-d @file` if it contains awkward quotes. The function inserts the product, resolves the category, and sets the submission to 'processed' or 'failed'. It is idempotent: a submission that is no longer pending is skipped, so retrying the same request is safe.
   If a product is missing only its image, still include it (image_url null) and mention it in the summary. Only put a submission under `failures` if it cannot be turned into a product at all.
4. Read the JSON response. It lists a status per submission (processed / failed / skipped). If the request itself fails (network error, non-200), retry once, then stop and report; do not fall back to writing through Supabase tools.
5. Log a summary: count of processed, failed and skipped, any errors, and confirm that image_url was populated for each processed product (or note which are missing an image and why).

If there are no pending submissions, confirm briefly.
```
