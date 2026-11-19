"use client";

import { useEffect, useState } from "react";
import { disablePush, enablePush, pushStatus, sendTestPush } from "../../lib/push";

const HINTS = {
  unsupported: "This browser can't show push notifications.",
  "needs-home-screen": "On iPhone or iPad, tap Share, then Add to Home Screen, and open the site from there to turn on notifications.",
  denied: "Notifications are blocked for this site. Allow them in your browser's site settings, then reload.",
};

export default function PushToggle() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    pushStatus().then(setStatus).catch(() => setStatus("unsupported"));
  }, []);

  async function act(fn, after) {
    setBusy(true);
    setNote("");
    try {
      await fn();
      if (after) setNote(after);
      setStatus(await pushStatus());
    } catch (err) {
      setNote(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <div className="pt-push">
      {status === "on" ? (
        <>
          <span className="pt-push-state">🔔 Notifications on for this device</span>
          <button type="button" className="pt-push-btn" disabled={busy}
            onClick={() => act(sendTestPush, "Test notification sent.")}>Send test</button>
          <button type="button" className="pt-push-btn ghost" disabled={busy}
            onClick={() => act(disablePush)}>Turn off</button>
        </>
      ) : status === "off" ? (
        <button type="button" className="pt-push-btn" disabled={busy}
          onClick={() => act(enablePush, "Done. You'll get price alerts on this device.")}>
          🔔 Turn on notifications
        </button>
      ) : (
        <span className="pt-push-hint">{HINTS[status]}</span>
      )}
      {note && <span className="pt-push-note">{note}</span>}
    </div>
  );
}
