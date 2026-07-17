"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./canvas.css";
import { supabase } from "../../lib/supabase";
import PolaroidNode from "./PolaroidNode";
import SwipeToConfirmDelete from "../components/SwipeToConfirmDelete";

function DeleteConfirmModal({ product, onCancel, onConfirm, deleting, error }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Delete product?</h2>
        <p className="modal-body">
          This will permanently delete <strong>{product.name}</strong>. This can't be undone.
        </p>
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="modal-btn cancel" onClick={onCancel} disabled={deleting}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn confirm-delete desktop-only"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
        <div className="mobile-only">
          <SwipeToConfirmDelete onConfirm={onConfirm} disabled={deleting} />
        </div>
      </div>
    </div>
  );
}

const nodeTypes = { polaroid: PolaroidNode };

// Grid layout for products that don't have a saved canvas position yet.
const CARD_W = 220;
const CARD_H = 280;
const GRID_GAP = 40;
const GRID_COLS = 6;

function gridPosition(index) {
  const col = index % GRID_COLS;
  const row = Math.floor(index / GRID_COLS);
  return {
    x: col * (CARD_W + GRID_GAP),
    y: row * (CARD_H + GRID_GAP),
  };
}

// Cards are rectangles CARD_W x CARD_H at their (x, y) top-left. A small
// margin is added so cards get some breathing room instead of just barely
// not touching.
const OVERLAP_MARGIN = 24;

function rectsOverlap(a, b) {
  return !(
    a.x + CARD_W + OVERLAP_MARGIN <= b.x ||
    b.x + CARD_W + OVERLAP_MARGIN <= a.x ||
    a.y + CARD_H + OVERLAP_MARGIN <= b.y ||
    b.y + CARD_H + OVERLAP_MARGIN <= a.y
  );
}

// Walk the grid slot-by-slot (reading order) and return the first slot that
// doesn't overlap any already-occupied rect. `occupied` includes both real
// (dragged, saved) positions and slots already handed out earlier in this
// same pass, so newly-placed cards never land on top of each other or on
// top of a manually positioned card.
function nextFreeGridPosition(occupied) {
  let index = 0;
  // Safety cap so a pathological state can't spin forever.
  while (index < 100000) {
    const candidate = gridPosition(index);
    if (!occupied.some((r) => rectsOverlap(candidate, r))) {
      return candidate;
    }
    index++;
  }
  return gridPosition(occupied.length);
}

// Stable pseudo-random rotation per product id, so it doesn't reshuffle on every render.
function rotationFor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return (hash % 700) / 100 - 3.5; // range roughly -3.5deg to +3.5deg
}

function CanvasInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [loading, setLoading] = useState(true);
  const [flippedIds, setFlippedIds] = useState(() => new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const { fitView } = useReactFlow();
  const saveTimers = useRef({});

  const toggleFlip = useCallback((id) => {
    setFlippedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleField = useCallback(
    (id, field) => {
      let previousValue;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          previousValue = n.data[field];
          return { ...n, data: { ...n.data, [field]: !previousValue } };
        })
      );
      supabase
        .from("products")
        .update({ [field]: !previousValue })
        .eq("id", id)
        .then(({ error }) => {
          if (error) {
            setNodes((nds) =>
              nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, [field]: previousValue } } : n))
            );
          }
        });
    },
    [setNodes]
  );

  const toggleFavorite = useCallback((id) => toggleField(id, "is_favorite"), [toggleField]);
  const togglePurchased = useCallback((id) => toggleField(id, "is_purchased"), [toggleField]);

  const requestDelete = useCallback((id, name) => {
    setDeleteError(null);
    setDeleteTarget({ id, name });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    setDeleting(true);
    setDeleteError(null);
    const { error } = await supabase.from("products").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) {
      setDeleteError(error.message || "Something went wrong. The item wasn't deleted — try again.");
      return false;
    }
    setNodes((nds) => nds.filter((n) => n.id !== deleteTarget.id));
    setFlippedIds((prev) => {
      if (!prev.has(deleteTarget.id)) return prev;
      const next = new Set(prev);
      next.delete(deleteTarget.id);
      return next;
    });
    setDeleteTarget(null);
    return true;
  }, [deleteTarget, setNodes]);

  useEffect(() => {
    async function load() {
      const { data: products } = await supabase
        .from("products")
        .select("*, categories(name)")
        .order("created_at", { ascending: true });

      const list = products || [];

      // Real, already-saved positions occupy their exact spot. Anything
      // without a saved position gets the next free grid slot that doesn't
      // overlap a real position OR a slot already handed out in this pass.
      const occupied = [];
      for (const p of list) {
        if (p.canvas_x != null && p.canvas_y != null) {
          occupied.push({ x: p.canvas_x, y: p.canvas_y });
        }
      }

      const toPersist = [];
      const builtNodes = list.map((p) => {
        const hasPosition = p.canvas_x != null && p.canvas_y != null;
        let position;
        if (hasPosition) {
          position = { x: p.canvas_x, y: p.canvas_y };
        } else {
          position = nextFreeGridPosition(occupied);
          occupied.push(position);
          toPersist.push({ id: p.id, ...position });
        }

        return {
          id: p.id,
          type: "polaroid",
          draggable: !flippedIds.has(p.id),
          position,
          data: {
            name: p.name,
            price: p.price,
            currency: p.currency,
            store: p.store,
            description: p.description,
            category: p.categories?.name,
            image_url: p.image_url,
            product_link: p.product_link || p.product_url,
            is_favorite: p.is_favorite,
            is_purchased: p.is_purchased,
            source: p.source,
            rotation: rotationFor(p.id),
            flipped: flippedIds.has(p.id),
            onToggleFlip: toggleFlip,
            onToggleFavorite: toggleFavorite,
            onTogglePurchased: togglePurchased,
            onDeleteRequest: requestDelete,
          },
        };
      });

      setNodes(builtNodes);
      setLoading(false);

      // Persist newly-assigned grid positions so they're stable (and stay
      // out of each other's way) on future loads instead of being
      // recomputed from scratch every time.
      if (toPersist.length > 0) {
        await Promise.all(
          toPersist.map(({ id, x, y }) =>
            supabase.from("products").update({ canvas_x: x, canvas_y: y }).eq("id", id)
          )
        );
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep each node's draggable flag and data.flipped in sync with flippedIds,
  // without re-fetching from Supabase or touching nodes that didn't change.
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        const isFlipped = flippedIds.has(n.id);
        if (Boolean(n.data.flipped) === isFlipped && Boolean(n.draggable) === !isFlipped) {
          return n;
        }
        return {
          ...n,
          draggable: !isFlipped,
          data: { ...n.data, flipped: isFlipped, onToggleFlip: toggleFlip },
        };
      })
    );
  }, [flippedIds, setNodes, toggleFlip]);

  // Always open zoomed out to fit everything — no persisted pan/zoom.
  useEffect(() => {
    if (!loading && nodes.length > 0) {
      requestAnimationFrame(() => fitView({ padding: 0.2, duration: 0 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, fitView]);

  const persistPosition = useCallback((id, x, y) => {
    if (saveTimers.current[id]) clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = setTimeout(async () => {
      await supabase.from("products").update({ canvas_x: x, canvas_y: y }).eq("id", id);
    }, 500);
  }, []);

  const onNodeDragStop = useCallback(
    (_event, node) => {
      persistPosition(node.id, node.position.x, node.position.y);
    },
    [persistPosition]
  );

  if (loading) return <p>Loading canvas…</p>;

  return (
    <div className="canvas-shell">
      <ReactFlow
        nodes={nodes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        panOnScroll
        zoomOnPinch
        panOnDrag
        minZoom={0.1}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={32} />
        <Controls />
      </ReactFlow>

      {deleteTarget && (
        <DeleteConfirmModal
          product={deleteTarget}
          deleting={deleting}
          error={deleteError}
          onCancel={() => {
            setDeleteTarget(null);
            setDeleteError(null);
          }}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
}

export default function CanvasPage() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
