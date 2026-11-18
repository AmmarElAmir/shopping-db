"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { extendTracking, setTracking, timeLeftLabel, TRACKING_DAYS } from "../../lib/priceTracking";

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

function TrackedRow({ p, history, busy, onToggle, onExtend }) {
  const link = p.product_link || p.product_url;
  const ended = !p.is_tracked;
  const left = timeLeftLabel(p.tracking_ends_at);
  const endingSoon = p.is_tracked && p.tracking_ends_at &&
    new Date(p.tracking_ends_at).getTime() - Date.now() <= 24 * 60 * 60 * 1000;
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
        <span className="pt-label">Current</span>
        <span className="pt-price">{formatPrice(p.price, p.currency)}</span>
        {atLowest && history.length > 1 && <span className="pt-chip low">Lowest yet</span>}
      </div>

      <div className="pt-cell">
        <span className="pt-label">Lowest seen</span>
        <span className="pt-price">{formatPrice(p.lowest_price, p.currency)}</span>
        {p.lowest_price_at && <span className="pt-meta">{DUBAI_TIME.format(new Date(p.lowest_price_at))}</span>}
      </div>

      <div className="pt-cell pt-trend">
        <span className="pt-label">Trend</span>
        <Sparkline points={history} />
        <ChangeBadge points={history} />
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
    </div>
  );
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
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: productData, error: pErr }, { data: historyData, error: hErr }] = await Promise.all([
      supabase.from("products").select("*").order("created_at", { ascending: false }),
      supabase.from("price_history").select("product_id, price, currency, checked_at").order("checked_at"),
    ]);
    if (pErr || hErr) setError((pErr || hErr).message);
    const grouped = {};
    for (const row of historyData || []) (grouped[row.product_id] ||= []).push(row);
    setProducts(productData || []);
    setHistory(grouped);
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
        const { data } = await supabase.from("price_history").select("product_id, price, currency, checked_at")
          .eq("product_id", p.id).order("checked_at");
        setHistory((h) => ({ ...h, [p.id]: data || [] }));
      }
    } catch (err) {
      setError(err.message || "Couldn't update tracking. Try again.");
    }
    setBusyId(null);
  }

  // Everything that has ever been tracked: active first (soonest to end), then
  // paused/ended. Untracked products only appear in the "Track another" picker.
  const { active, inactive, untracked } = useMemo(() => {
    const everTracked = products.filter((p) => p.tracking_started_at);
    return {
      active: everTracked.filter((p) => p.is_tracked)
        .sort((a, b) => new Date(a.tracking_ends_at) - new Date(b.tracking_ends_at)),
      inactive: everTracked.filter((p) => !p.is_tracked),
      untracked: products.filter((p) => !p.tracking_started_at && (p.product_link || p.product_url)),
    };
  }, [products]);

  if (loading) return <p>Loading…</p>;

  return (
    <div className="pt-page">
      <div className="pt-header">
        <div>
          <h1 className="pt-title">Price Tracker</h1>
          <p className="pt-sub">
            Prices are checked at 10 AM, 2 PM and 5 PM (Dubai) for {TRACKING_DAYS} days per product. You get a
            notification when a price drops below the lowest seen, and a day before tracking ends.
          </p>
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
            <div className="pt-list">
              {active.map((p) => (
                <TrackedRow key={p.id} p={p} history={history[p.id] || []} busy={busyId === p.id}
                  onToggle={(x) => run(x, (y) => setTracking(y, !y.is_tracked))}
                  onExtend={(x) => run(x, extendTracking)} />
              ))}
            </div>
          )}

          {inactive.length > 0 && (
            <>
              <h2 className="pt-section">Paused or ended ({inactive.length})</h2>
              <div className="pt-list">
                {inactive.map((p) => (
                  <TrackedRow key={p.id} p={p} history={history[p.id] || []} busy={busyId === p.id}
                    onToggle={(x) => run(x, (y) => setTracking(y, !y.is_tracked))}
                    onExtend={(x) => run(x, extendTracking)} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
