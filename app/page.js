"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [favOnly, setFavOnly] = useState(false);
  const [purchasedOnly, setPurchasedOnly] = useState(false);
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
      if (purchasedOnly && !p.is_purchased) return false;
      if (search && !p.name?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [products, categoryFilter, favOnly, purchasedOnly, search]);

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <div className="filters">
        <input
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <label>
          <input type="checkbox" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} /> Favorites
        </label>
        <label>
          <input type="checkbox" checked={purchasedOnly} onChange={(e) => setPurchasedOnly(e.target.checked)} /> Purchased
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="empty">No products yet. Send Claude a brief and it'll land here.</p>
      ) : (
        <div className="grid">
          {filtered.map((p) => {
            const link = p.product_link || p.product_url;
            const CardTag = link ? "a" : "div";
            const cardProps = link ? { href: link, target: "_blank", rel: "noopener noreferrer" } : {};
            return (
              <CardTag className={`card${link ? " card-link" : ""}`} key={p.id} {...cardProps}>
                <div className="card-image-wrap">
                  {p.image_url ? <img src={p.image_url} alt={p.name} /> : <div style={{ height: 150, background: "#eee" }} />}
                  {link && <span className="link-icon" aria-label="Opens product page">↗</span>}
                </div>
                <div className="card-body">
                  <div className="card-title">{p.name}</div>
                  <div className="card-meta">{p.store} · {p.categories?.name || "Uncategorized"}</div>
                  {p.price != null && <div className="card-price">{p.currency || "AED"} {p.price}</div>}
                  <p style={{ fontSize: 13, color: "#555" }}>{p.description}</p>
                  <div className="badges">
                    {p.is_favorite && <span className="badge fav">Favorite</span>}
                    {p.is_purchased && <span className="badge purchased">Purchased</span>}
                    {p.source === "online" && <span className="badge online">Online</span>}
                  </div>
                </div>
              </CardTag>
            );
          })}
        </div>
      )}
    </div>
  );
}
