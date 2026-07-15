"use client";

import BulkQueuePanel from "../components/BulkQueuePanel";

export default function BulkQueuePage() {
  return (
    <div>
      <h2>Bulk queue</h2>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 20 }}>
        Paste product links here, one or many at a time. Each one is saved instantly as
        pending — Claude processes them into full catalog entries later.
      </p>
      <BulkQueuePanel />
    </div>
  );
}
