"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AddProductPage() {
  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [form, setForm] = useState({
    name: "",
    price: "",
    currency: "AED",
    store: "",
    product_link: "",
    description: "",
    category_id: "",
    image_url: "",
    source: "manual",
    is_favorite: false,
    is_purchased: false,
  });
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("categories").select("*").order("name").then(({ data }) => setCategories(data || []));
  }, []);

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function uploadPhoto() {
    if (!photoFile) return null;
    const ext = photoFile.name.split(".").pop();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("product-images").upload(path, photoFile);
    if (error) throw error;
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setStatus("Saving…");

    try {
      let categoryId = form.category_id;
      if (!categoryId && newCategory.trim()) {
        const { data, error } = await supabase
          .from("categories")
          .insert({ name: newCategory.trim() })
          .select()
          .single();
        if (error) throw error;
        categoryId = data.id;
      }

      let imageUrl = form.image_url || null;
      if (photoFile) {
        setStatus("Uploading photo…");
        imageUrl = await uploadPhoto();
      }

      const { error } = await supabase.from("products").insert({
        name: form.name,
        price: form.price ? Number(form.price) : null,
        currency: form.currency,
        store: form.store,
        product_link: form.product_link || null,
        description: form.description,
        category_id: categoryId || null,
        image_url: imageUrl,
        source: form.source,
        is_favorite: form.is_favorite,
        is_purchased: form.is_purchased,
      });
      if (error) throw error;

      setStatus("Saved.");
      setForm({ ...form, name: "", price: "", store: "", product_link: "", description: "", image_url: "" });
      setNewCategory("");
      setPhotoFile(null);
      setPhotoPreview("");
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2>Add a product</h2>
      <p style={{ color: "#666", fontSize: 14 }}>
        Upload a photo and log the details manually here, or send Claude a brief in chat and it'll
        write up and insert the record for you.
      </p>
      <form onSubmit={handleSubmit}>
        <label>Photo</label>
        <input type="file" accept="image/*" onChange={handlePhotoChange} />
        {photoPreview && (
          <img src={photoPreview} alt="Preview" style={{ width: 160, height: 120, objectFit: "cover", borderRadius: 6 }} />
        )}
        <label>Or image URL (used if no photo uploaded)</label>
        <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />

        <label>Name</label>
        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

        <label>Description</label>
        <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

        <label>Price</label>
        <input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />

        <label>Currency</label>
        <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />

        <label>Store</label>
        <input value={form.store} onChange={(e) => setForm({ ...form, store: e.target.value })} />

        <label>Product / store link</label>
        <input
          type="url"
          placeholder="https://..."
          value={form.product_link}
          onChange={(e) => setForm({ ...form, product_link: e.target.value })}
        />

        <label>Category (existing)</label>
        <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
          <option value="">— none —</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <label>Or new category</label>
        <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="e.g. Air fryers" />

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

        <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save product"}</button>
        {status && <p>{status}</p>}
      </form>
    </div>
  );
}
