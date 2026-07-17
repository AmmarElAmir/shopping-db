"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { IconCartCheck, IconHeart, IconSparkle, IconLink, IconTrash } from "../lib/icons";
import SwipeToConfirmDelete from "./components/SwipeToConfirmDelete";
import FloatingAddButton from "./components/FloatingAddButton";

function Toggle({ on, onClick, label }) {
  return (
    <label className="toggle-label" onClick={onClick}>
      <button
        type="button"
        className={`toggle-switch${on ? " on" : ""}`}
        role="switch"
        aria-checked={on}
        aria-label={label}
      >
        <span className="thumb" />
      </button>
      {label}
    </label>
  );
}

function ProductCard({ p, categoryName, onToggleTag, onDeleteRequest }) {
  const link = p.product_link || p.product_url;
  const CardTag = link ? "a" : "div";
  const cardProps = link ? { href: link, target: "_blank", rel: "noopener noreferrer" } : {};
  const isAiGenerated = Boolean(p.claude_notes);

  function handleToggle(e, field) {
    e.preventDefault();
    e.stopPropagation();
    onToggleTag(p, field);
  }

  function handleDeleteClick(e) {
    e.preventDefault();
    e.stopPropagation();
    onDeleteRequest(p);
  }

  return (
    <CardTag className={`card${link ? " card-link" : ""}`} {...cardProps}>
      <div className="card-image-wrap">
        {p.image_url ? (
          <img src={p.image_url} alt={p.name} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "#eee" }} />
        )}
        <div className="card-tags-top">
          <button
            type="button"
            className={`tag-icon bought${p.is_purchased ? " on" : " off"}`}
            title="Purchased"
            onClick={(e) => handleToggle(e, "is_purchased")}
          >
            <IconCartCheck on={p.is_purchased} />
          </button>
          <button
            type="button"
            className={`tag-icon fav${p.is_favorite ? " on" : " off"}`}
            title="Favorite"
            onClick={(e) => handleToggle(e, "is_favorite")}
          >
            <IconHeart on={p.is_favorite} />
          </button>
          <button
            type="button"
            className="tag-icon delete"
            title="Delete product"
            onClick={handleDeleteClick}
          >
            <IconTrash />
          </button>
        </div>
        <div className="card-tags-bottom">
          <span className="category-badge">{categoryName || "Uncategorized"}</span>
          <div className="meta-badges">
            {isAiGenerated && (
              <span className="meta-badge" title="Claude-written description"><IconSparkle /></span>
            )}
            {link && (
              <span className="meta-badge" title="Linked to product page"><IconLink /></span>
            )}
          </div>
        </div>
      </div>
      <div className="card-body">
        <div className="card-title">{p.name}</div>
        <div className="card-subrow">
          <span className="card-store">{p.store}</span>
          {p.price != null && (
            <span className="card-price">
              <span className="currency">{p.currency || "AED"}</span>
              <span className="amount">{p.price}</span>
            </span>
          )}
        </div>
        <p className="card-description">{p.description}</p>
      </div>
    </CardTag>
  );
}

function DeleteConfirmModal({ product, onCancel, onConfirm, deleting, error }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Delete product?</h2>
        <p className="modal-body">
          This will permanently delete <strong>{product.name}</strong>. This can't be undone.
        </p>
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="modal-btn cancel" onClick={onCancel} disabled={deleting}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn confirm-delete desktop-only"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
        <div className="mobile-only">
          <SwipeToConfirmDelete onConfirm={onConfirm} disabled={deleting} />
        </div>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [favOnly, setFavOnly] = useState(false);
  const [hidePurchased, setHidePurchased] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    async function load() {
      const [{ data: productData }, { data: categoryData }] = await Promise.all([
        supabase
          .from("products")
          .select("*, categories(name)")
          .order("created_at", { ascending: false }),
        supabase.from("categories").select("*").order("name"),
      ]);
      setProducts(productData || []);
      setCategories(categoryData || []);
      setLoading(false);
    }
    load();
  }, []);

  async function handleToggleTag(product, field) {
    const next = !product[field];
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, [field]: next } : p))
    );
    const { error } = await supabase
      .from("products")
      .update({ [field]: next })
      .eq("id", product.id);
    if (error) {
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, [field]: product[field] } : p))
      );
    }
  }

  async function handleConfirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    const { error } = await supabase.from("products").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) {
      setDeleteError(error.message || "Something went wrong. The item wasn't deleted — try again.");
      return false;
    }
    setProducts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
    setDeleteTarget(null);
    return true;
  }

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (categoryFilter !== "all" && p.category_id !== categoryFilter) return false;
      if (favOnly && !p.is_favorite) return false;
      if (hidePurchased && p.is_purchased) return false;
      if (search && !p.name?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [products, categoryFilter, favOnly, hidePurchased, search]);

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <div className="filters">
        <input
          className="search-input"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="filters-toggles">
          <Toggle on={favOnly} onClick={() => setFavOnly((v) => !v)} label="Favorites Only" />
          <Toggle on={hidePurchased} onClick={() => setHidePurchased((v) => !v)} label="Hide Purchased" />
        </div>
      </div>

      <div className="category-filters">
        <button
          className={`category-pill${categoryFilter === "all" ? " selected" : ""}`}
          onClick={() => setCategoryFilter("all")}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            className={`category-pill${categoryFilter === c.id ? " selected" : ""}`}
            onClick={() => setCategoryFilter(categoryFilter === c.id ? "all" : c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="empty">No products yet. Send Claude a brief and it'll land here.</p>
      ) : (
        <div className="grid">
          {filtered.map((p) => (
            <ProductCard
              key={p.id}
              p={p}
              categoryName={p.categories?.name}
              onToggleTag={handleToggleTag}
              onDeleteRequest={(product) => {
                setDeleteError(null);
                setDeleteTarget(product);
              }}
            />
          ))}
        </div>
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          product={deleteTarget}
          deleting={deleting}
          error={deleteError}
          onCancel={() => {
            setDeleteTarget(null);
            setDeleteError(null);
          }}
          onConfirm={handleConfirmDelete}
        />
      )}

      <FloatingAddButton />
    </div>
  );
}
