// Supabase Edge Function: record-prices
//
// Write endpoint for the scheduled "Shopping DB price check" routine (see
// docs/price-check-routine.md). The routine runs at 10:00, 14:00 and 17:00
// Asia/Dubai, reads the tracked products (read-only), scrapes each product
// page for its current price (it needs Nimble for bot-protected retail pages),
// and POSTs all results here in one request. This function owns every write,
// so the unattended run never hits a tool-approval prompt.
//
// Request body:
//   {
//     "checks":   [{ "product_id", "price", "currency" }],
//     "failures": [{ "product_id", "error" }],
//
//     // Same item on the other platform (noon <-> Amazon.ae), see
//     // supabase/migrations/20261121000000_cross_platform_listings.sql:
//     "listing_checks":   [{ "listing_id", "price", "currency" }],
//     "listing_failures": [{ "listing_id", "error" }],
//     "matches":    [{ "product_id", "store": "noon"|"amazon", "url", "title",
//                      "price", "currency", "confidence": "exact"|"likely", "note" }],
//     "no_matches": [{ "product_id", "store", "note" }]
//   }
//
// matches / no_matches report the result of searching the other platform for a
// product (once per product; products.match_searched_at records it). "exact"
// matches are stored as confirmed, "likely" ones as suggested for Ammar to
// confirm on the tracker tab. A match's price is recorded as its first check.
//
// A listing check writes price_history with listing_id set and updates the
// listing's price / lowest. Confirmed listings also lower
// products.lowest_price, which is the lowest across both platforms.
//
// For each check it:
//   - inserts a price_history row (source 'check'),
//   - updates products.price / currency / last_checked_at / last_check_error,
//     and lowest_price / lowest_price_at when the price is a new low.
// Then it switches tracking off for windows that have ended.
//
// Alerts are not sent from here. The alerts feature hangs off price_history
// inserts with source = 'check' (a trigger detects new lows) and reads
// products.tracking_ends_at for the "one day left" reminder.
//
// Response:
//   { "ok": true,
//     "results": [{ product_id, status: "recorded" | "failed" | "skipped", error? }],
//     "listing_results": [{ listing_id, status, error? }],
//     "match_results": [{ product_id, status: "stored" | "no_match" | "failed", listing_id?, error? }],
//     "windows_closed": n }
//
// Auth: deployed with JWT verification on, so callers send the project's anon
// key as `Authorization: Bearer <key>`.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Check {
  product_id: string;
  price: number;
  currency?: string | null;
}

interface Failure {
  product_id: string;
  error: string;
}

interface ListingCheck {
  listing_id: string;
  price: number;
  currency?: string | null;
}

interface ListingFailure {
  listing_id: string;
  error: string;
}

interface Match {
  product_id: string;
  store: "noon" | "amazon";
  url: string;
  title?: string | null;
  price?: number | null;
  currency?: string | null;
  confidence: "exact" | "likely";
  note?: string | null;
}

interface NoMatch {
  product_id: string;
  store?: string | null;
  note?: string | null;
}

type Outcome = { product_id: string; status: "recorded" | "failed" | "skipped"; error?: string };
type ListingOutcome = { listing_id: string; status: "recorded" | "failed" | "skipped"; error?: string };
type MatchOutcome = { product_id: string; status: "stored" | "no_match" | "failed"; listing_id?: string; error?: string };

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ ok: false, error: "POST only" }, { status: 405 });
  }

  let body: {
    checks?: Check[];
    failures?: Failure[];
    listing_checks?: ListingCheck[];
    listing_failures?: ListingFailure[];
    matches?: Match[];
    no_matches?: NoMatch[];
  };
  try {
    body = await req.json();
  } catch (err) {
    return Response.json({ ok: false, error: `Bad payload: ${err.message}` }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const nowIso = new Date().toISOString();
  const results: Outcome[] = [];

  for (const check of body.checks || []) {
    try {
      results.push(await recordCheck(supabase, check, nowIso));
    } catch (err) {
      const message = String(err.message || err);
      console.error("record-prices check failed", check.product_id, message);
      results.push({ product_id: check.product_id, status: "failed", error: message });
    }
  }

  for (const failure of body.failures || []) {
    const { error } = await supabase
      .from("products")
      .update({ last_checked_at: nowIso, last_check_error: failure.error || "Unknown error" })
      .eq("id", failure.product_id)
      .eq("is_tracked", true);
    results.push({
      product_id: failure.product_id,
      status: "failed",
      error: error ? error.message : failure.error,
    });
  }

  // Other-platform matches first, so their first price lands as a listing check.
  const matchResults: MatchOutcome[] = [];
  const listingChecks: ListingCheck[] = [...(body.listing_checks || [])];
  for (const match of body.matches || []) {
    try {
      const listingId = await storeMatch(supabase, match, nowIso);
      matchResults.push({ product_id: match.product_id, status: "stored", listing_id: listingId });
      if (typeof match.price === "number" && match.price > 0) {
        listingChecks.push({ listing_id: listingId, price: match.price, currency: match.currency });
      }
    } catch (err) {
      const message = String(err.message || err);
      console.error("record-prices match failed", match.product_id, message);
      matchResults.push({ product_id: match.product_id, status: "failed", error: message });
    }
  }
  for (const miss of body.no_matches || []) {
    const label = miss.store === "noon" ? "noon" : miss.store === "amazon" ? "Amazon.ae" : "the other platform";
    const { error } = await supabase
      .from("products")
      .update({ match_searched_at: nowIso, match_search_note: miss.note || `No matching listing on ${label}` })
      .eq("id", miss.product_id);
    matchResults.push({
      product_id: miss.product_id,
      status: error ? "failed" : "no_match",
      ...(error ? { error: error.message } : {}),
    });
  }

  const listingResults: ListingOutcome[] = [];
  for (const check of listingChecks) {
    try {
      listingResults.push(await recordListingCheck(supabase, check, nowIso));
    } catch (err) {
      const message = String(err.message || err);
      console.error("record-prices listing check failed", check.listing_id, message);
      listingResults.push({ listing_id: check.listing_id, status: "failed", error: message });
    }
  }
  for (const failure of body.listing_failures || []) {
    const { error } = await supabase
      .from("product_listings")
      .update({ last_checked_at: nowIso, last_check_error: failure.error || "Unknown error" })
      .eq("id", failure.listing_id);
    listingResults.push({
      listing_id: failure.listing_id,
      status: "failed",
      error: error ? error.message : failure.error,
    });
  }

  // Close windows that have ended.
  const { data: closed, error: closeError } = await supabase
    .from("products")
    .update({ is_tracked: false })
    .eq("is_tracked", true)
    .lte("tracking_ends_at", nowIso)
    .select("id");
  if (closeError) console.error("record-prices close windows failed", closeError.message);

  return Response.json({
    ok: true,
    results,
    listing_results: listingResults,
    match_results: matchResults,
    windows_closed: closed?.length || 0,
  });
});

async function recordCheck(
  supabase: ReturnType<typeof createClient>,
  check: Check,
  nowIso: string,
): Promise<Outcome> {
  if (!check.product_id || typeof check.price !== "number" || !(check.price > 0)) {
    throw new Error("product_id and a positive numeric price are required");
  }

  const { data: p, error } = await supabase
    .from("products")
    .select("id, currency, lowest_price, is_tracked, tracking_ends_at")
    .eq("id", check.product_id)
    .maybeSingle();
  if (error) throw error;
  if (!p) throw new Error("Product not found");
  if (!p.is_tracked || !p.tracking_ends_at || new Date(p.tracking_ends_at) <= new Date(nowIso)) {
    return { product_id: p.id, status: "skipped", error: "Tracking is off or its window has ended" };
  }

  const currency = check.currency || p.currency || "AED";
  const { error: histError } = await supabase
    .from("price_history")
    .insert({ product_id: p.id, price: check.price, currency, source: "check", checked_at: nowIso });
  if (histError) throw histError;

  // products.lowest_price is the lowest across both platforms, so compare with
  // it as stored (a confirmed listing may hold the low).
  const previousLowest = p.lowest_price != null ? Number(p.lowest_price) : null;
  const isNewLow = previousLowest == null || check.price < previousLowest;

  const update: Record<string, unknown> = {
    price: check.price,
    currency,
    last_checked_at: nowIso,
    last_check_error: null,
  };
  if (isNewLow) {
    update.lowest_price = check.price;
    update.lowest_price_at = nowIso;
  }
  const { error: updError } = await supabase.from("products").update(update).eq("id", p.id);
  if (updError) throw updError;

  return { product_id: p.id, status: "recorded" };
}

function normaliseUrl(raw: string): string {
  const url = new URL(raw.trim());
  if (!/^https?:$/.test(url.protocol)) throw new Error("url must be an http(s) link");
  // Drop tracking parameters; the product path identifies the listing.
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|ref|aref|shareId|psc|th|tag|pd_rd|pf_rd|qid|sr|crid|sprefix|keywords|dib)/i.test(key)) {
      url.searchParams.delete(key);
    }
  }
  return url.toString();
}

async function storeMatch(
  supabase: ReturnType<typeof createClient>,
  match: Match,
  nowIso: string,
): Promise<string> {
  if (!match.product_id || !match.url) throw new Error("product_id and url are required");
  if (match.store !== "noon" && match.store !== "amazon") throw new Error("store must be noon or amazon");
  if (match.confidence !== "exact" && match.confidence !== "likely") {
    throw new Error("confidence must be exact or likely");
  }
  const url = normaliseUrl(match.url);

  const { data: existing, error: exErr } = await supabase
    .from("product_listings")
    .select("id, match_status")
    .eq("product_id", match.product_id)
    .eq("url", url)
    .maybeSingle();
  if (exErr) throw exErr;

  let listingId: string;
  if (existing) {
    // Never override Ammar's own decision on this listing.
    if (existing.match_status === "rejected") throw new Error("This listing was marked as not the same item");
    listingId = existing.id;
  } else {
    const { data, error } = await supabase
      .from("product_listings")
      .insert({
        product_id: match.product_id,
        store: match.store,
        url,
        title: match.title || null,
        match_status: match.confidence === "exact" ? "confirmed" : "suggested",
        match_note: match.note || null,
      })
      .select("id")
      .single();
    if (error) throw error;
    listingId = data.id;
  }

  const { error: pErr } = await supabase
    .from("products")
    .update({ match_searched_at: nowIso, match_search_note: null })
    .eq("id", match.product_id);
  if (pErr) throw pErr;
  return listingId;
}

async function recordListingCheck(
  supabase: ReturnType<typeof createClient>,
  check: ListingCheck,
  nowIso: string,
): Promise<ListingOutcome> {
  if (!check.listing_id || typeof check.price !== "number" || !(check.price > 0)) {
    throw new Error("listing_id and a positive numeric price are required");
  }
  const { data: l, error } = await supabase
    .from("product_listings")
    .select("id, product_id, match_status, lowest_price, currency, products(is_tracked, tracking_ends_at, lowest_price, currency)")
    .eq("id", check.listing_id)
    .maybeSingle();
  if (error) throw error;
  if (!l) throw new Error("Listing not found");
  const p = (l as any).products;
  if (l.match_status === "rejected") {
    return { listing_id: l.id, status: "skipped", error: "Listing was marked as not the same item" };
  }
  if (!p?.is_tracked || !p.tracking_ends_at || new Date(p.tracking_ends_at) <= new Date(nowIso)) {
    return { listing_id: l.id, status: "skipped", error: "Tracking is off or its window has ended" };
  }

  const currency = check.currency || l.currency || p.currency || "AED";
  const { error: histError } = await supabase.from("price_history").insert({
    product_id: l.product_id,
    listing_id: l.id,
    price: check.price,
    currency,
    source: "check",
    checked_at: nowIso,
  });
  if (histError) throw histError;

  const update: Record<string, unknown> = {
    price: check.price,
    currency,
    last_checked_at: nowIso,
    last_check_error: null,
  };
  if (l.lowest_price == null || check.price < Number(l.lowest_price)) {
    update.lowest_price = check.price;
    update.lowest_price_at = nowIso;
  }
  const { error: updError } = await supabase.from("product_listings").update(update).eq("id", l.id);
  if (updError) throw updError;

  if (l.match_status === "confirmed" && (p.lowest_price == null || check.price < Number(p.lowest_price))) {
    const { error: lowError } = await supabase
      .from("products")
      .update({ lowest_price: check.price, lowest_price_at: nowIso })
      .eq("id", l.product_id);
    if (lowError) throw lowError;
  }

  return { listing_id: l.id, status: "recorded" };
}
