"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

function extractLinks(raw) {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isLikelyUrl(s) {
  return /^https?:\/\/.+/i.test(s);
}

// Shared by BulkPasteModal (compact) and the /bulk-queue page (full size).
// Pasting into the input ingests immediately: links are split out, saved to
// the `submissions` table as pending, and the input clears itself. The list
// below always reflects the live database, newest (highest queue_number) first.
export default function BulkQueuePanel({ compact = false }) {
  const [inputValue, setInputValue] = useState("");
  const [queueItems, setQueueItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [error, setError] = useState(null);
  const [lastAdded, setLastAdded] = useState(0);

  async function loadQueue() {
    const { data, error: loadError } = await supabase
      .from("submissions")
      .select("id, link, queue_number, status")
      .eq("status", "pending")
      .order("queue_number", { ascending: true });
    if (!loadError) {
      // Number by current position among pending items (oldest = 1), not the
      // permanent DB identity value — so once earlier links are processed and
      // drop out of "pending", the remaining ones renumber starting at 1 again.
      const numbered = (data || []).map((item, idx) => ({ ...item, displayNumber: idx + 1 }));
      setQueueItems(numbered.reverse()); // newest pasted on top
    }
    setLoading(false);
  }

  useEffect(() => {
    loadQueue();
  }, []);

  async function ingest(text) {
    const links = [...new Set(extractLinks(text).filter(isLikelyUrl))];
    if (links.length === 0) {
      setError("That didn't look like a link. Paste one or more URLs.");
      return;
    }
    setIngesting(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from("submissions")
      .insert(links.map((link) => ({ link })))
      .select("id, link, queue_number, status");
    setIngesting(false);

    if (insertError) {
      setError(insertError.message || "Couldn't save those links. Try again.");
      return;
    }
    setLastAdded(data?.length || 0);
    await loadQueue();
  }

  function handlePaste(e) {
    e.preventDefault();
    const text = e.clipboardData.getData("text");
    setInputValue("");
    ingest(text);
  }

  function handleDrop(e) {
    e.preventDefault();
    const text = e.dataTransfer.getData("text");
    setInputValue("");
    ingest(text);
  }

  function handleDragOver(e) {
    e.preventDefault();
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      const text = inputValue;
      setInputValue("");
      ingest(text);
    }
  }

  return (
    <div className={`bulk-queue-panel${compact ? " compact" : ""}`}>
      {error && <p className="modal-error">{error}</p>}

      <input
        type="text"
        className="bulk-paste-input"
        placeholder="Paste or drag a product link here…"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onKeyDown={handleKeyDown}
        disabled={ingesting}
      />
      {ingesting && <p className="bulk-paste-hint">Saving…</p>}
      {!ingesting && !error && lastAdded > 0 && (
        <p className="bulk-paste-hint">
          Added {lastAdded} link{lastAdded === 1 ? "" : "s"} to the queue.
        </p>
      )}

      <div className="bulk-queue-list">
        {loading ? (
          <p className="empty">Loading queue…</p>
        ) : queueItems.length === 0 ? (
          <p className="empty">No links queued yet. Paste one above to get started.</p>
        ) : (
          queueItems.map((item) => (
            <div key={item.id} className="bulk-queue-row">
              <span className="queue-number">#{item.displayNumber}</span>
              <a className="queue-link" href={item.link} target="_blank" rel="noopener noreferrer">
                {item.link}
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
