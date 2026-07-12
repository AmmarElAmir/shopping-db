"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AddProductPage() {
  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState("");
  const [form, setForm] = useState({
    name: "",
    price: "",
    currency: "AED",
    store: "",
    description: "",
    category_id: "",
    image_url: "",
    source: "manual",
    is_favorite: false,
    is_purchased: false,
  });
  const [status, setStatus] = useState("");

  useEffect(() => {
    supabase.from("categories").select("*").order("name").then(({ data }) => setCategories(data || []));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("Saving…");

    let categoryId = form.category_id;
    if (!categoryId && newCategory.trim()) {
      const { data, error } = await supabase
        .from("categories")
        .insert({ name: newCategory.trim() })
        .select()
        .single();
      if (error) { setStatus(`Error: ${error.message}`); return; }
      categoryId = data.id;
    }

    const { error } = await supabase.from("products").insert({
      name: form.name,
      price: form.price ? Number(form.price) : null,
      currency: form.currency,
      store: form.store,
      description: form.description,
      category_id: categoryId || null,
      image_url: form.image_url || null,
      source: form.source,
      is_favorite: form.is_favorite,
      is_purchased: form.is_purchased,
    });

    if (error) {
      setStatus(`Error: ${error.message}`);
    } else {
      setStatus("Saved.");
      setForm({ ...form, name: "", price: "", store: "", description: "", image_url: "" });
      setNewCategory("");
    }
  }

  return (
    <div>
      <h2>Add a product</h2>
      <p style={{ color: "#666", fontSize: 14 }}>
        This is the manual entry form. When you send Claude a brief in chat, Claude fills this
        record in for you (name, description, category) and inserts it directly — you won't
        normally need this form yourself.
      </p>
      <form onSubmit={handleSubmit}>
        <label>Name</label>
        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

        <label>Price</label>
        <input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />

        <label>Currency</label>
        <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />

        <label>Store</label>
        <input value={form.store} onChange={(e) => setForm({ ...form, store: e.target.value })} />

        <label>Description</label>
        <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

        <label>Category (existing)</label>
        <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
          <option value="">— none —</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <label>Or new category</label>
        <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="e.g. Air fryers" />

        <label>Image URL</label>
        <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />

        <label>Source</label>
        <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
          <option value="manual">Manual</option>
          <option value="online">Online</option>
        </select>

        <label>
          <input type="checkbox" checked={form.is_favorite} onChange={(e) => setForm({ ...form, is_favorite: e.target.checked })} /> Favorite
        </label>
        <label>
          <input type="checkbox" checked={form.is_purchased} onChange={(e) => setForm({ ...form, is_purchased: e.target.checked })} /> Purchased
        </label>

        <button type="submit">Save product</button>
        {status && <p>{status}</p>}
      </form>
    </div>
  );
}
