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
  const [processing, setProcessing] = useState(false);
  const [processMessage, setProcessMessage] = useState(null);

  async function loadQueue() {
    const { data, error: loadError } = await supabase
      .from("submissions")
      .select("id, link, name, queue_number, status")
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

  // Normally the periodic routine checks for pending submissions on its own
  // schedule. This lets you fire that same check on demand instead of
  // waiting for it.
  async function handleProcessNow() {
    setProcessing(true);
    setProcessMessage(null);
    try {
      const res = await fetch("/api/process-queue", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setProcessMessage({ type: "error", text: data.error || "Couldn't trigger processing." });
      } else {
        setProcessMessage({ type: "success", text: "Processing triggered." });
      }
    } catch (err) {
      setProcessMessage({ type: "error", text: err.message || "Couldn't trigger processing." });
    }
    setProcessing(false);
    await loadQueue();
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
              {item.link ? (
                <a className="queue-link" href={item.link} target="_blank" rel="noopener noreferrer">
                  {item.name || item.link}
                </a>
              ) : (
                <span className="queue-link">{item.name || "(untitled)"}</span>
              )}
            </div>
          ))
        )}
      </div>

      <div className="bulk-queue-process">
        <button
          type="button"
          className="modal-btn secondary"
          onClick={handleProcessNow}
          disabled={processing || queueItems.length === 0}
        >
          {processing ? "Processing…" : "Process now"}
        </button>
        {processMessage && (
          <p className={processMessage.type === "error" ? "modal-error" : "bulk-paste-hint"}>
            {processMessage.text}
          </p>
        )}
      </div>
    </div>
  );
}
