"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import PushToggle from "../components/PushToggle";
import {
  addListingByHand,
  confirmListing,
  extendTracking,
  otherPlatformOf,
  platformLabel,
  rejectListing,
  searchAgain,
  setTracking,
  timeLeftLabel,
  TRACKING_DAYS,
} from "../../lib/priceTracking";

const DUBAI_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dubai",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function formatPrice(value, currency) {
  if (value == null) return "—";
  return `${currency || "AED"} ${Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function Sparkline({ points }) {
  if (!points || points.length < 2) {
    return <span className="pt-trend-empty">{points?.length === 1 ? "1 check so far" : "No checks yet"}</span>;
  }
  const W = 120;
  const H = 32;
  const prices = points.map((p) => Number(p.price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const coords = prices.map((v, i) => {
    const x = (i / (prices.length - 1)) * (W - 4) + 2;
    const y = max === min ? H / 2 : H - 3 - ((v - min) / span) * (H - 6);
    return [x, y];
  });
  const first = prices[0];
  const last = prices[prices.length - 1];
  const tone = last < first ? "down" : last > first ? "up" : "flat";
  const lowIdx = prices.indexOf(min);
  return (
    <svg className={`pt-spark ${tone}`} viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img"
      aria-label={`Price trend: ${prices.length} checks, from ${first} to ${last}`}>
      <polyline points={coords.map((c) => c.join(",")).join(" ")} fill="none" strokeWidth="1.8"
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={coords[lowIdx][0]} cy={coords[lowIdx][1]} r="2.6" className="pt-spark-low" />
      <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r="2.6" className="pt-spark-last" />
    </svg>
  );
}

function ChangeBadge({ points }) {
  if (!points || points.length < 2) return null;
  const first = Number(points[0].price);
  const last = Number(points[points.length - 1].price);
  if (!first || first === last) return <span className="pt-change flat">No change</span>;
  const pct = ((last - first) / first) * 100;
  return (
    <span className={`pt-change ${pct < 0 ? "down" : "up"}`}>
      {pct < 0 ? "▼" : "▲"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function TrackSwitch({ on, onClick, disabled }) {
  return (
    <label className="toggle-label pt-switch" onClick={disabled ? undefined : onClick}>
      <button type="button" className={`toggle-switch${on ? " on" : ""}`} role="switch" aria-checked={on}
        aria-label="Tracking" disabled={disabled}>
        <span className="thumb" />
      </button>
      {on ? "On" : "Off"}
    </label>
  );
}

// The price recorded when tracking was switched on: the first history row in the
// current tracking period, falling back to the earliest row we have.
function startingPrice(p, history) {
  if (!history.length) return null;
  const since = p.tracking_started_at ? new Date(p.tracking_started_at).getTime() : null;
  const inPeriod = since == null ? null : history.find((h) => new Date(h.checked_at).getTime() >= since - 60 * 1000);
  return inPeriod || history[0];
}

// The same item on the other platform (noon <-> Amazon.ae): its price next to
// this one, a confirm step for uncertain matches, or a way to paste a link.
function OtherPlatform({ p, listings, onListing, onProduct }) {
  const platform = otherPlatformOf(p);
  const [pasting, setPasting] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  if (!platform) return null;
  const label = platformLabel(platform);
  const listing = listings.find((l) => l.match_status === "confirmed") ||
    listings.find((l) => l.match_status === "suggested");

  async function act(fn, apply) {
    setBusy(true);
    setErr(null);
    try {
      apply(await fn());
      setPasting(false);
      setUrl("");
    } catch (e) {
      setErr(e.message || "Couldn't save that. Try again.");
    }
    setBusy(false);
  }

  const pasteForm = (
    <form className="pt-other-paste" onSubmit={(e) => {
      e.preventDefault();
      if (url.trim()) act(() => addListingByHand(p, url), onListing);
    }}>
      <input className="search-input" type="url" placeholder={`Paste the ${label} link`} value={url}
        onChange={(e) => setUrl(e.target.value)} autoFocus />
      <button type="submit" className="pt-extend" disabled={busy || !url.trim()}>Add</button>
      <button type="button" className="pt-link-btn" onClick={() => setPasting(false)}>Cancel</button>
    </form>
  );

  let body;
  if (listing) {
    const own = p.price != null ? Number(p.price) : null;
    const theirs = listing.price != null ? Number(listing.price) : null;
    const diff = own != null && theirs != null ? theirs - own : null;
    const suggested = listing.match_status === "suggested";
    body = (
      <>
        <span className="pt-other-text">
          <span className="pt-label">{suggested ? `Possible match on ${label}` : `Also on ${label}`}</span>
          <a className="pt-other-name" href={listing.url} target="_blank" rel="noopener noreferrer">
            {listing.title || `View on ${label}`}
          </a>
          {suggested && listing.match_note && <span className="pt-meta">{listing.match_note}</span>}
          {listing.last_check_error && <span className="pt-error">Last check failed: {listing.last_check_error}</span>}
        </span>
        <span className="pt-other-price">
          <span className="pt-price">{theirs != null ? formatPrice(theirs, listing.currency || p.currency) : "Checking soon"}</span>
          {diff != null && diff < 0 && <span className="pt-chip low">{formatPrice(-diff, p.currency)} cheaper</span>}
          {diff != null && diff > 0 && <span className="pt-meta">{formatPrice(diff, p.currency)} more</span>}
          {diff === 0 && <span className="pt-meta">Same price</span>}
        </span>
        <span className="pt-other-actions">
          {suggested ? (
            <>
              <span className="pt-meta">Same item?</span>
              <button type="button" className="pt-extend" disabled={busy}
                onClick={() => act(() => confirmListing(listing), onListing)}>Yes, track it</button>
              <button type="button" className="pt-link-btn" disabled={busy}
                onClick={() => act(() => rejectListing(listing), onListing)}>Not it</button>
            </>
          ) : (
            <button type="button" className="pt-link-btn" disabled={busy}
              onClick={() => act(() => rejectListing(listing), onListing)}>Not the same item</button>
          )}
        </span>
      </>
    );
  } else if (pasting) {
    body = pasteForm;
  } else if (p.match_searched_at) {
    body = (
      <>
        <span className="pt-meta">{p.match_search_note || `Not found on ${label}`}</span>
        <span className="pt-other-actions">
          <button type="button" className="pt-link-btn" onClick={() => setPasting(true)}>Paste a link</button>
          {p.is_tracked && (
            <button type="button" className="pt-link-btn" disabled={busy}
              onClick={() => act(() => searchAgain(p), onProduct)}>Search again</button>
          )}
        </span>
      </>
    );
  } else {
    body = (
      <>
        <span className="pt-meta">
          {p.is_tracked ? `Looking for it on ${label} at the next check.` : `Not checked on ${label} yet.`}
        </span>
        <span className="pt-other-actions">
          <button type="button" className="pt-link-btn" onClick={() => setPasting(true)}>Paste a link</button>
        </span>
      </>
    );
  }

  return (
    <div className="pt-other">
      {body}
      {err && <span className="pt-error">{err}</span>}
    </div>
  );
}

function TrackedRow({ p, history, listings, busy, onToggle, onExtend, onListing, onProduct }) {
  const link = p.product_link || p.product_url;
  const ended = !p.is_tracked;
  const left = timeLeftLabel(p.tracking_ends_at);
  const endingSoon = p.is_tracked && p.tracking_ends_at &&
    new Date(p.tracking_ends_at).getTime() - Date.now() <= 24 * 60 * 60 * 1000;
  // history holds both platforms; the sparkline and starting price follow this
  // product's own link, while "Lowest seen" is the lowest on either.
  const ownHistory = history.filter((h) => !h.listing_id);
  const start = startingPrice(p, ownHistory);
  const hasOther = listings.some((l) => l.match_status === "confirmed");
  const atLowest = p.price != null && p.lowest_price != null && Number(p.price) <= Number(p.lowest_price);

  return (
    <div className={`pt-row${ended ? " ended" : ""}`}>
      <div className="pt-product">
        {p.image_url ? <img src={p.image_url} alt="" /> : <div className="pt-img-placeholder" />}
        <div className="pt-product-text">
          {link ? (
            <a className="pt-name" href={link} target="_blank" rel="noopener noreferrer">{p.name}</a>
          ) : (
            <span className="pt-name">{p.name}</span>
          )}
          <span className="pt-meta">
            {p.store || "Unknown store"}
            {p.last_checked_at && ` · checked ${DUBAI_TIME.format(new Date(p.last_checked_at))}`}
          </span>
          {p.last_check_error && <span className="pt-error">Last check failed: {p.last_check_error}</span>}
        </div>
      </div>

      <div className="pt-cell">
        <span className="pt-label">Started at</span>
        <span className="pt-price">{start ? formatPrice(start.price, start.currency || p.currency) : "—"}</span>
        {start && <span className="pt-meta">{DUBAI_TIME.format(new Date(start.checked_at))}</span>}
      </div>

      <div className="pt-cell">
        <span className="pt-label">Current</span>
        <span className="pt-price">{formatPrice(p.price, p.currency)}</span>
        {atLowest && ownHistory.length > 1 && <span className="pt-chip low">Lowest yet</span>}
      </div>

      <div className="pt-cell">
        <span className="pt-label">{hasOther ? "Lowest (both)" : "Lowest seen"}</span>
        <span className="pt-price">{formatPrice(p.lowest_price, p.currency)}</span>
        {p.lowest_price_at && <span className="pt-meta">{DUBAI_TIME.format(new Date(p.lowest_price_at))}</span>}
      </div>

      <div className="pt-cell pt-trend">
        <span className="pt-label">Trend</span>
        <Sparkline points={ownHistory} />
        <ChangeBadge points={ownHistory} />
      </div>

      <div className="pt-cell pt-actions">
        <TrackSwitch on={Boolean(p.is_tracked)} disabled={busy} onClick={() => onToggle(p)} />
        <span className={`pt-meta${endingSoon ? " pt-ending" : ""}`}>
          {p.is_tracked ? left : p.tracking_ends_at && new Date(p.tracking_ends_at) <= new Date() ? "Period ended" : "Paused"}
        </span>
        <button type="button" className="pt-extend" disabled={busy} onClick={() => onExtend(p)}>
          +{TRACKING_DAYS} days
        </button>
      </div>

      <OtherPlatform p={p} listings={listings} onListing={onListing} onProduct={onProduct} />
    </div>
  );
}

const UNCATEGORIZED = "Uncategorized";
const byName = (a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base", numeric: true });

// Groups products by their category, headings A to Z with Uncategorized last,
// products sorted by name inside each group.
function groupByCategory(items) {
  const groups = new Map();
  for (const p of items) {
    const name = p.categories?.name || UNCATEGORIZED;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(p);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === UNCATEGORIZED) - (b === UNCATEGORIZED) || byName({ name: a }, { name: b }))
    .map(([name, list]) => [name, list.sort(byName)]);
}

function GroupedList({ items, renderRow }) {
  return groupByCategory(items).map(([name, list]) => (
    <div className="pt-group" key={name}>
      <h3 className="pt-group-title">{name} <span>({list.length})</span></h3>
      <div className="pt-list">{list.map(renderRow)}</div>
    </div>
  ));
}

function AddTracking({ products, onTrack, busy }) {
  const [value, setValue] = useState("");
  if (products.length === 0) return null;
  return (
    <form className="pt-add" onSubmit={(e) => {
      e.preventDefault();
      const p = products.find((x) => x.id === value);
      if (p) onTrack(p).then(() => setValue(""));
    }}>
      <select className="search-input pt-add-select" value={value} onChange={(e) => setValue(e.target.value)}>
        <option value="">Track another product…</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}{p.price != null ? ` (${formatPrice(p.price, p.currency)})` : ""}
          </option>
        ))}
      </select>
      <button type="submit" className="edit-btn" disabled={!value || busy}>Start tracking</button>
    </form>
  );
}

export default function PriceTrackerPage() {
  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState({});
  const [listings, setListings] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [
      { data: productData, error: pErr },
      { data: historyData, error: hErr },
      { data: listingData, error: lErr },
    ] = await Promise.all([
      supabase.from("products").select("*, categories(name)").order("created_at", { ascending: false }),
      supabase.from("price_history").select("product_id, listing_id, price, currency, checked_at").order("checked_at"),
      supabase.from("product_listings").select("*").neq("match_status", "rejected"),
    ]);
    if (pErr || hErr || lErr) setError((pErr || hErr || lErr).message);
    const grouped = {};
    for (const row of historyData || []) (grouped[row.product_id] ||= []).push(row);
    const byProduct = {};
    for (const row of listingData || []) (byProduct[row.product_id] ||= []).push(row);
    setProducts(productData || []);
    setHistory(grouped);
    setListings(byProduct);
    setLoading(false);
  }

  async function run(p, fn) {
    setBusyId(p.id);
    setError(null);
    try {
      const updated = await fn(p);
      setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...updated } : x)));
      if (updated.is_tracked && !p.is_tracked) {
        // Pick up the baseline price row written when tracking started.
        const { data } = await supabase.from("price_history").select("product_id, listing_id, price, currency, checked_at")
          .eq("product_id", p.id).order("checked_at");
        setHistory((h) => ({ ...h, [p.id]: data || [] }));
      }
    } catch (err) {
      setError(err.message || "Couldn't update tracking. Try again.");
    }
    setBusyId(null);
  }

  // A listing was confirmed, rejected or added: rejected ones drop off the row.
  function applyListing(listing) {
    setListings((prev) => {
      const rest = (prev[listing.product_id] || []).filter((l) => l.id !== listing.id);
      return { ...prev, [listing.product_id]: listing.match_status === "rejected" ? rest : [...rest, listing] };
    });
  }

  function applyProduct(updated) {
    setProducts((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
  }

  // Everything that has ever been tracked: active first, then paused/ended, each
  // grouped by category (A to Z, Uncategorized last) and sorted by name.
  // Untracked products only appear in the "Track another" picker.
  const { active, inactive, untracked } = useMemo(() => {
    const everTracked = products.filter((p) => p.tracking_started_at);
    return {
      active: everTracked.filter((p) => p.is_tracked),
      inactive: everTracked.filter((p) => !p.is_tracked),
      untracked: products.filter((p) => !p.tracking_started_at && (p.product_link || p.product_url)),
    };
  }, [products]);

  const renderRow = (p) => (
    <TrackedRow key={p.id} p={p} history={history[p.id] || []} listings={listings[p.id] || []}
      busy={busyId === p.id} onListing={applyListing} onProduct={applyProduct}
      onToggle={(x) => run(x, (y) => setTracking(y, !y.is_tracked))}
      onExtend={(x) => run(x, extendTracking)} />
  );

  if (loading) return <p>Loading…</p>;

  return (
    <div className="pt-page">
      <div className="pt-header">
        <div>
          <h1 className="pt-title">Price Tracker</h1>
          <p className="pt-sub">
            Prices are checked at 10 AM, 2 PM and 5 PM (Dubai) for {TRACKING_DAYS} days per product. You get a
            notification when a price drops below the lowest seen, and a day before tracking ends. Products from noon
            or Amazon.ae are also checked on the other site when the same item is sold there.
          </p>
          <PushToggle />
        </div>
        <AddTracking products={untracked} busy={Boolean(busyId)} onTrack={(p) => run(p, (x) => setTracking(x, true))} />
      </div>

      {error && <p className="modal-error">{error}</p>}

      {active.length === 0 && inactive.length === 0 ? (
        <p className="empty">
          Nothing is being tracked yet. Turn on tracking with the trend icon on a product card, or pick one above.
        </p>
      ) : (
        <>
          <h2 className="pt-section">Tracking ({active.length})</h2>
          {active.length === 0 ? (
            <p className="pt-meta">No products are being tracked right now.</p>
          ) : (
            <GroupedList items={active} renderRow={renderRow} />
          )}

          {inactive.length > 0 && (
            <>
              <h2 className="pt-section">Paused or ended ({inactive.length})</h2>
              <GroupedList items={inactive} renderRow={renderRow} />
            </>
          )}
        </>
      )}
    </div>
  );
}
