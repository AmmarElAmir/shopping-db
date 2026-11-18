// Supabase Edge Function: price-alerts
//
// Alert endpoint for the price tracker. The scheduled "Shopping DB price
// alerts" Claude task calls it about 15 minutes after each price check, posts
// the alerts to Ammar, then acknowledges them. Claude also calls it when
// Ammar replies "extend". Every write goes through here, so the unattended
// task only ever makes HTTP calls and never hits a tool-approval prompt.
//
// Price-drop alerts are written by the `trg_price_history_drop_alert` trigger
// (see supabase/migrations/20261118000100_price_alerts.sql). The one-day-left
// alerts are written here, from products.tracking_ends_at, so they still go
// out on a day when a scrape fails.
//
// Request body, one of:
//   { "action": "collect" }
//       Writes any due tracking_ending alerts (once per window), then returns
//       every alert not yet sent:
//       { ok, alerts: [{ id, kind, product_id, name, link, store, currency,
//         old_price, new_price, lowest_price, current_price,
//         tracking_ends_at, created_at }] }
//   { "action": "ack", "alert_ids": ["..."] }
//       Marks alerts as sent. Call only after they were delivered.
//   { "action": "extend", "product_ids": ["..."] }
//   { "action": "extend", "all_ending": true }
//       Adds 7 days to each product's window (from its current end, or from
//       now if it already ended), turns tracking back on, and re-arms the
//       one-day-left alert. all_ending extends every tracked product with
//       2 days or less left, plus any whose window ended in the last 2 days.
//
// Auth: deployed with JWT verification on, so callers send the project's anon
// key as `Authorization: Bearer <key>`.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DAY_MS = 24 * 60 * 60 * 1000;
const TRACKING_DAYS = 7;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const num = (v: unknown) => (v == null ? null : Number(v));

async function writeEndingAlerts(now: Date) {
  const nowIso = now.toISOString();
  const cutoff = new Date(now.getTime() + DAY_MS).toISOString();
  // Claim the products with a conditional update first, so a retried or
  // overlapping call cannot write the same alert twice.
  const { data: claimed, error } = await supabase
    .from("products")
    .update({ ending_alert_sent_at: nowIso })
    .eq("is_tracked", true)
    .is("ending_alert_sent_at", null)
    .gt("tracking_ends_at", nowIso)
    .lte("tracking_ends_at", cutoff)
    .select("id, price, currency, tracking_ends_at");
  if (error) throw error;
  if (!claimed?.length) return 0;

  const rows = claimed.map((p) => ({
    product_id: p.id,
    kind: "tracking_ending",
    new_price: p.price,
    currency: p.currency || "AED",
    tracking_ends_at: p.tracking_ends_at,
  }));
  const { error: insError } = await supabase.from("price_alerts").insert(rows);
  if (insError) {
    // Release the claim so the next run tries again.
    await supabase
      .from("products")
      .update({ ending_alert_sent_at: null })
      .in("id", claimed.map((p) => p.id));
    throw insError;
  }
  return rows.length;
}

async function collect() {
  const now = new Date();
  const written = await writeEndingAlerts(now);

  const { data, error } = await supabase
    .from("price_alerts")
    .select(
      "id, kind, product_id, old_price, new_price, currency, tracking_ends_at, created_at, " +
        "products(name, product_link, product_url, store, price, lowest_price, tracking_ends_at, is_tracked)",
    )
    .is("sent_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const alerts = (data || []).map((a: any) => ({
    id: a.id,
    kind: a.kind,
    product_id: a.product_id,
    name: a.products?.name ?? null,
    link: a.products?.product_link || a.products?.product_url || null,
    store: a.products?.store ?? null,
    currency: a.currency || "AED",
    old_price: num(a.old_price),
    new_price: num(a.new_price),
    current_price: num(a.products?.price),
    lowest_price: num(a.products?.lowest_price),
    // The product's live window end (it may have been extended since).
    tracking_ends_at: a.products?.tracking_ends_at ?? a.tracking_ends_at,
    is_tracked: a.products?.is_tracked ?? false,
    created_at: a.created_at,
  }));
  return { ok: true, ending_alerts_written: written, alerts };
}

async function ack(ids: unknown) {
  if (!Array.isArray(ids) || !ids.length) throw new Error("alert_ids must be a non-empty array");
  const { data, error } = await supabase
    .from("price_alerts")
    .update({ sent_at: new Date().toISOString() })
    .in("id", ids)
    .is("sent_at", null)
    .select("id");
  if (error) throw error;
  return { ok: true, acknowledged: (data || []).map((r) => r.id) };
}

async function extend(productIds: unknown, allEnding: unknown) {
  const now = new Date();
  let query = supabase.from("products").select("id, name, tracking_started_at, tracking_ends_at");
  if (allEnding === true) {
    const soon = new Date(now.getTime() + 2 * DAY_MS).toISOString();
    const recent = new Date(now.getTime() - 2 * DAY_MS).toISOString();
    query = query.gte("tracking_ends_at", recent).lte("tracking_ends_at", soon);
  } else if (Array.isArray(productIds) && productIds.length) {
    query = query.in("id", productIds);
  } else {
    throw new Error("Pass product_ids (non-empty array) or all_ending: true");
  }
  const { data: products, error } = await query;
  if (error) throw error;

  const results = [];
  for (const p of products || []) {
    const currentEnd = p.tracking_ends_at ? new Date(p.tracking_ends_at) : now;
    const base = currentEnd > now ? currentEnd : now;
    const newEnd = new Date(base.getTime() + TRACKING_DAYS * DAY_MS).toISOString();
    const { error: updError } = await supabase
      .from("products")
      .update({
        is_tracked: true,
        tracking_started_at: p.tracking_started_at || now.toISOString(),
        tracking_ends_at: newEnd,
        ending_alert_sent_at: null,
      })
      .eq("id", p.id);
    results.push(
      updError
        ? { product_id: p.id, name: p.name, status: "failed", error: updError.message }
        : { product_id: p.id, name: p.name, status: "extended", tracking_ends_at: newEnd },
    );
  }
  return { ok: true, results };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ ok: false, error: "POST only" }, { status: 405 });
  }
  let body: any;
  try {
    body = await req.json();
  } catch (err) {
    return Response.json({ ok: false, error: `Bad payload: ${err.message}` }, { status: 400 });
  }
  try {
    switch (body?.action) {
      case "collect":
        return Response.json(await collect());
      case "ack":
        return Response.json(await ack(body.alert_ids));
      case "extend":
        return Response.json(await extend(body.product_ids, body.all_ending));
      default:
        return Response.json({ ok: false, error: "action must be collect, ack or extend" }, { status: 400 });
    }
  } catch (err) {
    return Response.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
});
