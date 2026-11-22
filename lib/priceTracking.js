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

// ---- Same item on the other platform (noon <-> Amazon.ae) ----
// The scheduled price check searches the other platform once per tracked
// product and stores what it finds in product_listings: "confirmed" when the
// model and variant match exactly, "suggested" when it needs Ammar's OK.

const PLATFORM_LABEL = { noon: "noon", amazon: "Amazon.ae" };

export function platformOf(product) {
  const link = product.product_link || product.product_url || "";
  let host = "";
  try {
    host = new URL(link).hostname;
  } catch {}
  const store = (product.store || "").toLowerCase();
  if (/(^|\.)noon\.com$/i.test(host) || store.startsWith("noon")) return "noon";
  if (/(^|\.)amazon\.[a-z.]+$|(^|\.)amzn\.[a-z.]+$/i.test(host) || store.startsWith("amazon")) return "amazon";
  return null;
}

// Where to look for the same item, or null for stores other than noon/Amazon.
export function otherPlatformOf(product) {
  const own = platformOf(product);
  return own === "noon" ? "amazon" : own === "amazon" ? "noon" : null;
}

// Identity of a product page across URL shapes (short links, tracking params,
// slugs): the Amazon ASIN or the noon catalogue code. Mirrors itemKey in the
// record-prices edge function.
export function itemKey(url, extra) {
  const asinOf = (u) => {
    if (!u) return null;
    const m = u.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?#]|$)/i) || u.match(/[?&]asin=([A-Z0-9]{10})/i);
    return m ? m[1].toUpperCase() : null;
  };
  const asin = asinOf(url) || asinOf(extra);
  if (asin) return `amazon:${asin}`;
  if (!url) return null;
  if (/noon\.com/i.test(url)) {
    const m = url.match(/\/([A-Z0-9]{8,})\/p(?:[/?#]|$)/i);
    if (m) return `noon:${m[1].toUpperCase()}`;
  }
  return `url:${url.split("#")[0]}`;
}

export function platformLabel(platform) {
  return PLATFORM_LABEL[platform] || platform;
}

async function updateListing(listing, fields) {
  const { data, error } = await supabase
    .from("product_listings")
    .update(fields)
    .eq("id", listing.id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export function confirmListing(listing) {
  return updateListing(listing, { match_status: "confirmed" });
}

export function rejectListing(listing) {
  return updateListing(listing, { match_status: "rejected" });
}

// A link pasted on the tracker tab counts as confirmed.
// Its price is read at the next scheduled check.
export async function addListingByHand(product, rawUrl) {
  const platform = otherPlatformOf(product);
  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("That doesn't look like a link.");
  }
  const isNoon = /(^|\.)noon\.com$/i.test(url.hostname);
  const isAmazon = /(^|\.)amazon\.[a-z.]+$|(^|\.)amzn\.[a-z.]+$/i.test(url.hostname);
  if ((platform === "noon" && !isNoon) || (platform === "amazon" && !isAmazon)) {
    throw new Error(`Paste a ${platformLabel(platform)} link.`);
  }
  const { data, error } = await supabase
    .from("product_listings")
    .upsert(
      { product_id: product.id, store: platform, url: url.toString(), match_status: "confirmed", match_note: "Added by hand" },
      { onConflict: "product_id,url" },
    )
    .select("*")
    .single();
  if (error) throw error;
  await supabase.from("products").update({ match_searched_at: new Date().toISOString(), match_search_note: null })
    .eq("id", product.id);
  return data;
}

// Queue a fresh search of the other platform at the next scheduled check.
export async function searchAgain(product) {
  const { data, error } = await supabase
    .from("products")
    .update({ match_searched_at: null, match_search_note: null })
    .eq("id", product.id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
