"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { IconCartCheck, IconHeart, IconSparkle, IconLink } from "../lib/icons";

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

function ProductCard({ p, categoryName }) {
  const link = p.product_link || p.product_url;
  const CardTag = link ? "a" : "div";
  const cardProps = link ? { href: link, target: "_blank", rel: "noopener noreferrer" } : {};
  const isAiGenerated = Boolean(p.claude_notes);

  return (
    <CardTag className={`card${link ? " card-link" : ""}`} {...cardProps}>
      <div className="card-image-wrap">
        {p.image_url ? (
          <img src={p.image_url} alt={p.name} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "#eee" }} />
        )}
        <div className="card-tags-top">
          {p.is_purchased && (
            <span className="tag-icon bought" title="Purchased"><IconCartCheck /></span>
          )}
          {p.is_favorite && (
            <span className="tag-icon fav" title="Favorite"><IconHeart /></span>
          )}
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

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [favOnly, setFavOnly] = useState(false);
  const [hidePurchased, setHidePurchased] = useState(false);
  const [search, setSearch] = useState("");

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
        <Toggle on={favOnly} onClick={() => setFavOnly((v) => !v)} label="Favorites Only" />
        <Toggle on={hidePurchased} onClick={() => setHidePurchased((v) => !v)} label="Hide Purchased" />
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
            <ProductCard key={p.id} p={p} categoryName={p.categories?.name} />
          ))}
        </div>
      )}
    </div>
  );
}
