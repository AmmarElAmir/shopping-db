// Client helpers for opt-in price tracking. Tracking is off by default; these
// are the only places the site turns it on, off, or extends it.

import { supabase } from "./supabase";

export const TRACKING_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(from, days) {
  return new Date(from.getTime() + days * DAY_MS).toISOString();
}

// Turn tracking on: opens a fresh 7-day window and records the current price
// as the baseline so the trend starts from today.
export async function startTracking(product) {
  const now = new Date();
  const nowIso = now.toISOString();
  const update = {
    is_tracked: true,
    tracking_started_at: nowIso,
    tracking_ends_at: addDays(now, TRACKING_DAYS),
    ending_alert_sent_at: null,
  };
  const hasPrice = product.price != null;
  if (hasPrice && (product.lowest_price == null || Number(product.price) < Number(product.lowest_price))) {
    update.lowest_price = product.price;
    update.lowest_price_at = nowIso;
  }
  const { data, error } = await supabase.from("products").update(update).eq("id", product.id).select("*").single();
  if (error) throw error;
  if (hasPrice) {
    await supabase.from("price_history").insert({
      product_id: product.id,
      price: product.price,
      currency: product.currency || "AED",
      source: "baseline",
      checked_at: nowIso,
    });
  }
  return data;
}

export async function stopTracking(product) {
  const { data, error } = await supabase
    .from("products")
    .update({ is_tracked: false })
    .eq("id", product.id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// Add another 7 days onto the current window (or from now, if it has ended).
export async function extendTracking(product) {
  const now = new Date();
  const currentEnd = product.tracking_ends_at ? new Date(product.tracking_ends_at) : now;
  const base = currentEnd > now ? currentEnd : now;
  const { data, error } = await supabase
    .from("products")
    .update({
      is_tracked: true,
      tracking_started_at: product.tracking_started_at || now.toISOString(),
      tracking_ends_at: addDays(base, TRACKING_DAYS),
      ending_alert_sent_at: null,
    })
    .eq("id", product.id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export function setTracking(product, on) {
  return on ? startTracking(product) : stopTracking(product);
}

export function timeLeftLabel(endsAt) {
  if (!endsAt) return "";
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "Ended";
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / (60 * 60 * 1000));
  if (days >= 1) return `${days}d ${hours}h left`;
  return `${Math.max(hours, 1)}h left`;
}
