"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function SubmitPage() {
  const [link, setLink] = useState("");
  const [text, setText] = useState("");
  const [submittedBy, setSubmittedBy] = useState("");
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  function handleFilesChange(e) {
    const selected = Array.from(e.target.files || []);
    setFiles(selected);
    setPreviews(selected.map((f) => URL.createObjectURL(f)));
  }

  async function uploadImage(file) {
    const ext = file.name.split(".").pop();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("submission-images").upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from("submission-images").getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!link.trim() && !text.trim() && files.length === 0) {
      setStatus("Add at least a link, a description, or a photo before submitting.");
      return;
    }

    setSaving(true);
    setStatus("Submitting…");

    try {
      let imageUrls = [];
      if (files.length > 0) {
        setStatus(`Uploading ${files.length} photo(s)…`);
        imageUrls = await Promise.all(files.map(uploadImage));
      }

      const { data: submission, error: submissionError } = await supabase
        .from("submissions")
        .insert({
          link: link.trim() || null,
          text: text.trim() || null,
          submitted_by: submittedBy.trim() || null,
        })
        .select()
        .single();
      if (submissionError) throw submissionError;

      if (imageUrls.length > 0) {
        const { error: imagesError } = await supabase
          .from("submission_images")
          .insert(imageUrls.map((image_url) => ({ submission_id: submission.id, image_url })));
        if (imagesError) throw imagesError;
      }

      setStatus("Submitted! It'll show up in the catalog shortly once it's processed.");
      setLink("");
      setText("");
      setFiles([]);
      setPreviews([]);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2>Submit a product</h2>
      <p style={{ color: "#666", fontSize: 14 }}>
        Drop in a link, a quick description, and/or a few photos — no need to write it up
        yourself. It gets processed automatically and shows up in the catalog once it's done.
      </p>
      <form onSubmit={handleSubmit}>
        <label>Link</label>
        <input
          type="url"
          placeholder="https://..."
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />

        <label>Description</label>
        <textarea
          rows={3}
          placeholder="Whatever you know — name, price, why you like it…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <label>Photos</label>
        <input type="file" accept="image/*" multiple onChange={handleFilesChange} />
        {previews.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {previews.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`Preview ${i + 1}`}
                style={{ width: 100, height: 80, objectFit: "cover", borderRadius: 6 }}
              />
            ))}
          </div>
        )}

        <label>Your name</label>
        <input
          placeholder="So we know who to thank"
          value={submittedBy}
          onChange={(e) => setSubmittedBy(e.target.value)}
        />

        <button type="submit" disabled={saving}>{saving ? "Submitting…" : "Submit"}</button>
        {status && <p>{status}</p>}
      </form>
    </div>
  );
}
