"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function ComparisonsPage() {
  const [comparisons, setComparisons] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("comparisons")
      .select("*, categories(name)")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setComparisons(data || []);
        setLoading(false);
      });
  }, []);

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <h2>Comparisons</h2>
      <p style={{ color: "#666", fontSize: 14 }}>
        Every time you ask Claude to compare a product, the writeup is logged here automatically.
      </p>
      {comparisons.length === 0 ? (
        <p className="empty">No comparisons logged yet.</p>
      ) : (
        comparisons.map((c) => (
          <div key={c.id} className="card" style={{ marginBottom: 16, padding: 16 }}>
            <h3 style={{ margin: "0 0 6px" }}>{c.title}</h3>
            <div className="card-meta">{c.categories?.name}</div>
            <p style={{ whiteSpace: "pre-wrap" }}>{c.summary}</p>
          </div>
        ))
      )}
    </div>
  );
}
