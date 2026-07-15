"use client";

import { useRouter } from "next/navigation";
import BulkQueuePanel from "./BulkQueuePanel";

export default function BulkPasteModal({ open, onClose }) {
  const router = useRouter();

  if (!open) return null;

  function handleViewQueue() {
    onClose();
    router.push("/bulk-queue");
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Bulk paste links</h2>
        <p className="modal-body">
          Paste product links here — each one is saved right away as <strong>pending</strong>,
          ready for Claude to process later.
        </p>

        <BulkQueuePanel compact />

        <div className="modal-actions modal-actions-split">
          <button type="button" className="modal-btn tertiary" onClick={handleViewQueue}>
            View Queue
          </button>
          <button type="button" className="modal-btn cancel" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
