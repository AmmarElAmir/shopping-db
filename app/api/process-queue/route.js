// POST /api/process-queue
//
// Manually fires the same routine your scheduled cron check calls, which
// scans the `submissions` table for pending rows and processes them. Used by
// the "Process now" button on the Bulk queue page (see BulkQueuePanel.js).
//
// The routine URL and token live server-side only (ROUTINE_TRIGGER_URL /
// ROUTINE_TRIGGER_TOKEN in .env.local) so they never reach the browser.

export async function POST() {
  const url = process.env.ROUTINE_TRIGGER_URL;
  const token = process.env.ROUTINE_TRIGGER_TOKEN;

  if (!url || !token) {
    return Response.json(
      { ok: false, error: "Routine trigger is not configured on the server." },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      },
    });

    const bodyText = await res.text();

    if (!res.ok) {
      return Response.json(
        { ok: false, error: `Trigger failed (${res.status}): ${bodyText}` },
        { status: 502 },
      );
    }

    return Response.json({ ok: true, result: bodyText || null });
  } catch (err) {
    return Response.json(
      { ok: false, error: err.message || "Failed to reach the routine trigger." },
      { status: 502 },
    );
  }
}
