// Supabase Edge Function: price-alerts
//
// Alert endpoint for the price tracker. The scheduled "Shopping DB price
// alerts" Claude task calls it about 15 minutes after each price check, posts
// the alerts to Ammar, then acknowledges them. Claude also calls it when
// Ammar replies "extend". Every write goes through here, so the unattended
// task only ever makes HTTP calls and never hits a tool-approval prompt.
//
// Price-drop alerts are written by the `trg_price_history_drop_alert` trigger
// (see supabase/migrations/20261118000100_price_alerts.sql, updated in
// 20261121000000_cross_platform_listings.sql to look across noon and
// Amazon.ae, with the alert's store/link naming where the low was seen). The one-day-left
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
//       If VAPID keys are set, each alert not yet pushed is also sent as a
//       browser push notification to every subscribed device (once).
//   { "action": "subscribe", "subscription": PushSubscriptionJSON, "user_agent" }
//   { "action": "unsubscribe", "endpoint": "..." }
//   { "action": "test_push", "endpoint": "..." }   (one device; omit for all)
//       Browser push setup, called by the site's Price Tracker tab.
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
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DAY_MS = 24 * 60 * 60 * 1000;
const TRACKING_DAYS = 7;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Web Push (VAPID). Keys come from the function secrets VAPID_PUBLIC_KEY /
// VAPID_PRIVATE_KEY / VAPID_SUBJECT, or else from the service-role-only
// `push_config` table (see 20261119000000_push_subscriptions.sql).
let PUSH_ENABLED = false;
let vapidLoaded = false;
async function loadVapid() {
  if (vapidLoaded) return PUSH_ENABLED;
  vapidLoaded = true;
  let pub = Deno.env.get("VAPID_PUBLIC_KEY");
  let priv = Deno.env.get("VAPID_PRIVATE_KEY");
  let subject = Deno.env.get("VAPID_SUBJECT");
  if (!pub || !priv) {
    const { data } = await supabase.from("push_config")
      .select("vapid_public_key, vapid_private_key, vapid_subject").eq("id", 1).maybeSingle();
    pub = data?.vapid_public_key;
    priv = data?.vapid_private_key;
    subject = subject || data?.vapid_subject;
  }
  if (pub && priv) {
    webpush.setVapidDetails(subject || "mailto:alerts@example.com", pub, priv);
    PUSH_ENABLED = true;
  }
  return PUSH_ENABLED;
}

const DUBAI_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dubai", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
});

const money = (v: number | null, cur: string) =>
  v == null ? "?" : `${Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${cur}`;

function shortName(name: string | null) {
  const n = name || "A tracked product";
  return n.length > 60 ? n.slice(0, 57) + "…" : n;
}

function alertPayload(a: any) {
  if (a.kind === "price_drop") {
    return {
      title: `Price drop: ${shortName(a.name)}`,
      body: `Now ${money(a.new_price, a.currency)} (lowest before: ${money(a.old_price, a.currency)})` +
        (a.store ? ` at ${a.store}` : ""),
      url: a.link || "/price-tracker",
      tag: `drop-${a.product_id}`,
    };
  }
  const ends = a.tracking_ends_at ? DUBAI_TIME.format(new Date(a.tracking_ends_at)) : "soon";
  return {
    title: `Tracking ends soon: ${shortName(a.name)}`,
    body: `Ends ${ends} (Dubai). Now ${money(a.new_price, a.currency)}. Tap to extend by 7 days.`,
    url: "/price-tracker",
    tag: `ending-${a.product_id}`,
  };
}

async function sendToSubscriptions(payloads: object[], endpoint?: string) {
  if (!(await loadVapid())) return { configured: false, devices: 0, sent: 0, removed: 0 };
  let query = supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth");
  if (endpoint) query = query.eq("endpoint", endpoint);
  const { data: subs, error } = await query;
  if (error) throw error;
  let sent = 0;
  let removed = 0;
  for (const s of subs || []) {
    const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
    for (const payload of payloads) {
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 6 * 60 * 60 });
        sent++;
        await supabase.from("push_subscriptions")
          .update({ last_success_at: new Date().toISOString(), last_error: null }).eq("id", s.id);
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          // The browser dropped this subscription; forget it.
          await supabase.from("push_subscriptions").delete().eq("id", s.id);
          removed++;
          break;
        }
        await supabase.from("push_subscriptions")
          .update({ last_error: String(err?.body || err?.message || err).slice(0, 500) }).eq("id", s.id);
      }
    }
  }
  return { configured: true, devices: (subs || []).length, sent, removed };
}

async function pushNewAlerts(alerts: any[]) {
  const fresh = alerts.filter((a) => !a.pushed_at);
  if (!(await loadVapid()) || !fresh.length) return { configured: PUSH_ENABLED, pushed: 0 };
  const result = await sendToSubscriptions(fresh.map(alertPayload));
  // Stamp them either way, so a device that subscribes later is not flooded
  // with old alerts and a retried collect does not push twice.
  await supabase.from("price_alerts").update({ pushed_at: new Date().toISOString() })
    .in("id", fresh.map((a) => a.id));
  return { ...result, pushed: fresh.length };
}

async function subscribe(sub: any, userAgent: unknown) {
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || !p256dh || !auth) {
    throw new Error("subscription must include an https endpoint and keys.p256dh / keys.auth");
  }
  const { error } = await supabase.from("push_subscriptions").upsert(
    { endpoint, p256dh, auth, user_agent: typeof userAgent === "string" ? userAgent.slice(0, 300) : null, last_error: null },
    { onConflict: "endpoint" },
  );
  if (error) throw error;
  return { ok: true, push_configured: await loadVapid() };
}

async function unsubscribe(endpoint: unknown) {
  if (typeof endpoint !== "string" || !endpoint) throw new Error("endpoint is required");
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) throw error;
  return { ok: true };
}

async function testPush(endpoint: unknown) {
  if (!(await loadVapid())) throw new Error("Push is not configured yet (VAPID keys missing).");
  const result = await sendToSubscriptions(
    [{ title: "Price tracker notifications are on", body: "You'll get price drop and tracking-ending alerts here.", url: "/price-tracker", tag: "test" }],
    typeof endpoint === "string" && endpoint ? endpoint : undefined,
  );
  if (!result.devices) throw new Error("This device is not subscribed. Turn notifications on first.");
  return { ok: true, ...result };
}

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
      "id, kind, product_id, old_price, new_price, currency, tracking_ends_at, created_at, pushed_at, store, link, " +
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
    // A drop can be on the product's own link or on the same item on the other
    // platform (noon / Amazon.ae); the alert row says where.
    link: a.link || a.products?.product_link || a.products?.product_url || null,
    store: a.store || a.products?.store || null,
    currency: a.currency || "AED",
    old_price: num(a.old_price),
    new_price: num(a.new_price),
    current_price: num(a.products?.price),
    lowest_price: num(a.products?.lowest_price),
    // The product's live window end (it may have been extended since).
    tracking_ends_at: a.products?.tracking_ends_at ?? a.tracking_ends_at,
    is_tracked: a.products?.is_tracked ?? false,
    created_at: a.created_at,
    pushed_at: a.pushed_at,
  }));
  let push;
  try {
    push = await pushNewAlerts(alerts);
  } catch (err) {
    // Never let a push problem block the Claude fallback message.
    push = { configured: PUSH_ENABLED, error: String((err as any)?.message || err) };
  }
  return { ok: true, ending_alerts_written: written, push, alerts };
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

// The site calls subscribe / unsubscribe / test_push from the browser.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ ok: false, error: "POST only" }, 405);
  let body: any;
  try {
    body = await req.json();
  } catch (err) {
    return reply({ ok: false, error: `Bad payload: ${(err as any).message}` }, 400);
  }
  try {
    switch (body?.action) {
      case "collect":
        return reply(await collect());
      case "subscribe":
        return reply(await subscribe(body.subscription, body.user_agent));
      case "unsubscribe":
        return reply(await unsubscribe(body.endpoint));
      case "test_push":
        return reply(await testPush(body.endpoint));
      case "ack":
        return reply(await ack(body.alert_ids));
      case "extend":
        return reply(await extend(body.product_ids, body.all_ending));
      default:
        return reply({ ok: false, error: "action must be collect, ack, extend, subscribe, unsubscribe or test_push" }, 400);
    }
  } catch (err) {
    return reply({ ok: false, error: String((err as any)?.message || err) }, 500);
  }
});
