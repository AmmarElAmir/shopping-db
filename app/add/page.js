"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { IconChevronDown, IconMic } from "../../lib/icons";

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

  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const baseDescriptionRef = useRef("");
  const finalTranscriptRef = useRef("");

  useEffect(() => {
    supabase.from("categories").select("*").order("name").then(({ data }) => setCategories(data || []));
  }, []);

  useEffect(() => {
    setSpeechSupported(typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition));
    return () => recognitionRef.current?.stop();
  }, []);

  function toggleDictation() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionImpl();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    baseDescriptionRef.current = form.description ? `${form.description} ` : "";
    finalTranscriptRef.current = "";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscriptRef.current += `${transcript} `;
        } else {
          interim += transcript;
        }
      }
      setForm((f) => ({ ...f, description: baseDescriptionRef.current + finalTranscriptRef.current + interim }));
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
  }

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
      <h2 className="add-page-title">Add a product</h2>
      <p className="add-page-subtitle">
        Upload a photo and log the details manually here, or send Claude a brief in chat and it'll
        write up and insert the record for you.
      </p>
      <form className="add-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-field">
            <label className="field-label">Photo</label>
            <div className="field-file-wrap">
              <label className="field-file-label" htmlFor="photo-upload">
                {photoFile ? photoFile.name : "Choose File"}
              </label>
              <input id="photo-upload" className="field-file-input" type="file" accept="image/*" onChange={handlePhotoChange} />
            </div>
            {photoPreview && <img src={photoPreview} alt="Preview" className="photo-preview" />}
          </div>

          <div className="form-field">
            <label className="field-label">Or image URL</label>
            <input
              className="field-input"
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
            />
          </div>
        </div>

        <div className="form-field">
          <label className="field-label">Name</label>
          <input
            className="field-input"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>

        <div className="form-field">
          <div className="field-label-row">
            <label className="field-label">Description</label>
            {speechSupported && (
              <button
                type="button"
                className={`mic-btn${listening ? " listening" : ""}`}
                title={listening ? "Stop dictation" : "Dictate description"}
                aria-pressed={listening}
                onClick={toggleDictation}
              >
                <IconMic />
              </button>
            )}
          </div>
          <textarea
            className="field-textarea"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>

        <div className="form-row">
          <div className="form-field">
            <label className="field-label">Price</label>
            <input
              className="field-input"
              type="number"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </div>

          <div className="form-field">
            <label className="field-label">Currency</label>
            <input
              className="field-input"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label className="field-label">Store</label>
            <input className="field-input" value={form.store} onChange={(e) => setForm({ ...form, store: e.target.value })} />
          </div>

          <div className="form-field">
            <label className="field-label">Product / store link</label>
            <input
              className="field-input"
              type="url"
              placeholder="https://..."
              value={form.product_link}
              onChange={(e) => setForm({ ...form, product_link: e.target.value })}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label className="field-label">Category (existing)</label>
            <div className="field-select-wrap">
              <select
                className="field-input field-select"
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              >
                <option value="">— none —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <IconChevronDown />
            </div>
          </div>

          <div className="form-field">
            <label className="field-label">Or new category</label>
            <input
              className="field-input"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="e.g. Air fryers"
            />
          </div>
        </div>

        <button
          type="button"
          className="favorite-toggle-btn"
          onClick={() => setForm({ ...form, is_favorite: !form.is_favorite })}
        >
          <span className={`toggle-switch${form.is_favorite ? " on" : ""}`} role="switch" aria-checked={form.is_favorite}>
            <span className="thumb" />
          </span>
          <span>Favorite</span>
        </button>

        <button type="submit" className="btn-save" disabled={saving}>{saving ? "Saving…" : "Save product"}</button>
        {status && <p className="add-status">{status}</p>}
      </form>
    </div>
  );
}
