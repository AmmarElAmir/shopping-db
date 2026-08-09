"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const CATEGORIES = ["Clothing", "Feeding", "Nursery", "Bathing", "Safety", "Travel", "Health", "Other"];

function StatusToggle({ status, onClick }) {
  const purchased = status === "purchased";
  return (
    <button
      type="button"
      className={`baby-status-pill${purchased ? " purchased" : " needed"}`}
      onClick={onClick}
    >
      {purchased ? "Purchased" : "Needed"}
    </button>
  );
}

function AddItemRow({ onAdd, adding }) {
  const [form, setForm] = useState({
    item: "",
    category: "Clothing",
    size: "",
    store: "",
    pack_size: 1,
    quantity: 1,
    price: "",
  });

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.item.trim()) return;
    const ok = await onAdd({
      ...form,
      pack_size: Number(form.pack_size) || 1,
      quantity: Number(form.quantity) || 1,
      price: form.price === "" ? null : Number(form.price),
    });
    if (ok) {
      setForm({ item: "", category: form.category, size: "", store: "", pack_size: 1, quantity: 1, price: "" });
    }
  }

  return (
    <form className="baby-add-row" onSubmit={handleSubmit}>
      <input
        className="baby-input baby-input-item"
        placeholder="Item name…"
        value={form.item}
        onChange={(e) => update("item", e.target.value)}
      />
      <select className="baby-input" value={form.category} onChange={(e) => update("category", e.target.value)}>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <input
        className="baby-input baby-input-narrow"
        placeholder="Size"
        value={form.size}
        onChange={(e) => update("size", e.target.value)}
      />
      <input
        className="baby-input baby-input-narrow"
        placeholder="Store"
        value={form.store}
        onChange={(e) => update("store", e.target.value)}
      />
      <input
        type="number"
        min="1"
        className="baby-input baby-input-tiny"
        title="Pack size"
        value={form.pack_size}
        onChange={(e) => update("pack_size", e.target.value)}
      />
      <input
        type="number"
        min="1"
        className="baby-input baby-input-tiny"
        title="Quantity ordered"
        value={form.quantity}
        onChange={(e) => update("quantity", e.target.value)}
      />
      <input
        type="number"
        step="0.01"
        className="baby-input baby-input-narrow"
        placeholder="Price"
        value={form.price}
        onChange={(e) => update("price", e.target.value)}
      />
      <button type="submit" className="baby-add-btn" disabled={adding || !form.item.trim()}>
        {adding ? "Adding…" : "Add"}
      </button>
    </form>
  );
}

export default function BabyNeedsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [hidePurchased, setHidePurchased] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("baby_needs")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    setItems(data || []);
    setLoading(false);
  }

  async function handleAdd(form) {
    setAdding(true);
    setError(null);
    const { data, error } = await supabase
      .from("baby_needs")
      .insert({ ...form, source: "manual", status: "needed" })
      .select()
      .single();
    setAdding(false);
    if (error) {
      setError(error.message || "Couldn't add that item — try again.");
      return false;
    }
    setItems((prev) => [data, ...prev]);
    return true;
  }

  async function handleToggleStatus(item) {
    const nextStatus = item.status === "purchased" ? "needed" : "purchased";
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: nextStatus } : i))
    );
    const { error } = await supabase
      .from("baby_needs")
      .update({
        status: nextStatus,
        purchased_at: nextStatus === "purchased" ? new Date().toISOString() : null,
      })
      .eq("id", item.id);
    if (error) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: item.status } : i))
      );
    }
  }

  async function handleDelete(item) {
    if (!confirm(`Remove "${item.item}" from the tracker?`)) return;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    const { error } = await supabase.from("baby_needs").delete().eq("id", item.id);
    if (error) {
      setError(error.message);
      load();
    }
  }

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (categoryFilter !== "all" && i.category !== categoryFilter) return false;
      if (hidePurchased && i.status === "purchased") return false;
      return true;
    });
  }, [items, categoryFilter, hidePurchased]);

  const totals = useMemo(() => {
    const pieces = filtered.reduce((sum, i) => sum + (i.total_pieces || 0), 0);
    const spend = filtered.reduce((sum, i) => sum + (i.status === "purchased" ? Number(i.price || 0) : 0), 0);
    return { pieces, spend, count: filtered.length };
  }, [filtered]);

  const categoriesInUse = useMemo(() => {
    const set = new Set(items.map((i) => i.category).filter(Boolean));
    return Array.from(set);
  }, [items]);

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <h2>Baby Needs Tracker</h2>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: -8, marginBottom: 16 }}>
        Simple checklist for newborn/baby shopping — separate from the main product catalog. Mark items purchased as you go.
      </p>

      {error && <p className="modal-error" style={{ marginBottom: 12 }}>{error}</p>}

      <AddItemRow onAdd={handleAdd} adding={adding} />

      <div className="filters" style={{ marginTop: 16 }}>
        <div className="filters-toggles">
          <label className="toggle-label" onClick={() => setHidePurchased((v) => !v)}>
            <button
              type="button"
              className={`toggle-switch${hidePurchased ? " on" : ""}`}
              role="switch"
              aria-checked={hidePurchased}
            >
              <span className="thumb" />
            </button>
            Hide Purchased
          </label>
        </div>
      </div>

      <div className="category-filters">
        <button
          className={`category-pill${categoryFilter === "all" ? " selected" : ""}`}
          onClick={() => setCategoryFilter("all")}
        >
          All
        </button>
        {categoriesInUse.map((c) => (
          <button
            key={c}
            className={`category-pill${categoryFilter === c ? " selected" : ""}`}
            onClick={() => setCategoryFilter(categoryFilter === c ? "all" : c)}
          >
            {c}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="empty">No items yet. Add one above.</p>
      ) : (
        <div className="baby-table-wrap">
          <table className="baby-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Size</th>
                <th>Store</th>
                <th>Pack</th>
                <th>Qty</th>
                <th>Pieces</th>
                <th>Price</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id} className={i.status === "purchased" ? "row-purchased" : ""}>
                  <td className="baby-item-cell">{i.item}</td>
                  <td>{i.category || "—"}</td>
                  <td>{i.size || "—"}</td>
                  <td>{i.store || "—"}</td>
                  <td>{i.pack_size}</td>
                  <td>{i.quantity}</td>
                  <td>{i.total_pieces}</td>
                  <td>{i.price != null ? `${i.currency || "AED"} ${i.price}` : "—"}</td>
                  <td>
                    <StatusToggle status={i.status} onClick={() => handleToggleStatus(i)} />
                  </td>
                  <td>
                    <button type="button" className="baby-delete-btn" onClick={() => handleDelete(i)} title="Remove">
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6} style={{ textAlign: "right", fontWeight: 600 }}>
                  Totals ({totals.count} items)
                </td>
                <td style={{ fontWeight: 600 }}>{totals.pieces}</td>
                <td style={{ fontWeight: 600 }}>AED {totals.spend.toFixed(2)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
