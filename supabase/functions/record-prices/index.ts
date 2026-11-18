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
//     "failures": [{ "product_id", "error" }]
//   }
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

type Outcome = { product_id: string; status: "recorded" | "failed" | "skipped"; error?: string };

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ ok: false, error: "POST only" }, { status: 405 });
  }

  let body: { checks?: Check[]; failures?: Failure[] };
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
