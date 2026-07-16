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
  const { fitView } = useReactFlow();
  const saveTimers = useRef({});

  useEffect(() => {
    async function load() {
      const { data: products } = await supabase
        .from("products")
        .select("*, categories(name)")
        .order("created_at", { ascending: true });

      const list = products || [];
      const builtNodes = list.map((p, index) => {
        const hasPosition = p.canvas_x != null && p.canvas_y != null;
        const position = hasPosition
          ? { x: p.canvas_x, y: p.canvas_y }
          : gridPosition(index);

        return {
          id: p.id,
          type: "polaroid",
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
          },
        };
      });

      setNodes(builtNodes);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Always open zoomed out to fit everything — no persisted pan/zoom.
  useEffect(() => {
    if (!loading && nodes.length > 0) {
      requestAnimationFrame(() => fitView({ padding: 0.2, duration: 0 }));
    }
  }, [loading, nodes.length, fitView]);

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
