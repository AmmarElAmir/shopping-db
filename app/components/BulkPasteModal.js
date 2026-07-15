"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";

// Splits pasted text into individual candidate links. Handles one-per-line,
// but also tolerates multiple links crammed onto one line separated by
// whitespace or commas.
function extractLinks(raw) {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isLikelyUrl(s) {
  return /^https?:\/\/.+/i.test(s);
}

export default function BulkPasteModal({ open, onClose }) {
  const [raw, setRaw] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null); // { added, skipped }
  const [error, setError] = useState(null);

  if (!open) return null;

  const candidates = raw.trim() ? extractLinks(raw) : [];
  const validLinks = [...new Set(candidates.filter(isLikelyUrl))];
  const invalidCount = candidates.length - validLinks.length;

  function handleClose() {
    setRaw("");
    setResult(null);
    setError(null);
    onClose();
  }

  async function handleAdd() {
    if (validLinks.length === 0) return;
    setSaving(true);
    setError(null);
    setResult(null);

    const { error: insertError, data } = await supabase
      .from("submissions")
      .insert(validLinks.map((link) => ({ link })))
      .select("id");

    setSaving(false);

    if (insertError) {
      setError(insertError.message || "Something went wrong adding these links. Try again.");
      return;
    }

    setResult({ added: data?.length ?? validLinks.length, skipped: invalidCount });
    setRaw("");
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Bulk paste links</h2>
        <p className="modal-body">
          Paste multiple product links at once, one per line. Each one is added to the
          queue as <strong>pending</strong> — Claude picks them up and processes the
          details later.
        </p>

        {error && <p className="modal-error">{error}</p>}

        {result && (
          <p className="bulk-paste-summary">
            Added <strong>{result.added}</strong> link{result.added === 1 ? "" : "s"} as pending.
            {result.skipped > 0 && (
              <> Skipped {result.skipped} entr{result.skipped === 1 ? "y" : "ies"} that didn't look like a URL.</>
            )}
          </p>
        )}

        <textarea
          className="bulk-paste-textarea"
          placeholder={"https://example.com/product-1\nhttps://example.com/product-2\nhttps://example.com/product-3"}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          disabled={saving}
        />
        <p className="bulk-paste-hint">
          One link per line works best. Non-link text is ignored automatically.
        </p>

        {raw.trim() && (
          <p className="bulk-paste-count">
            {validLinks.length} link{validLinks.length === 1 ? "" : "s"} detected
            {invalidCount > 0 ? `, ${invalidCount} entr${invalidCount === 1 ? "y" : "ies"} ignored` : ""}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="modal-btn cancel" onClick={handleClose} disabled={saving}>
            Close
          </button>
          <button
            type="button"
            className="modal-btn confirm-add"
            onClick={handleAdd}
            disabled={saving || validLinks.length === 0}
          >
            {saving ? "Adding…" : `Add ${validLinks.length || ""} link${validLinks.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
