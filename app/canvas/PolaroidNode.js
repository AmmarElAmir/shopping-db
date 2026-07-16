"use client";

import { memo, useRef, useState } from "react";
import { Handle, Position } from "@xyflow/react";

function PolaroidNode({ data }) {
  const [flipped, setFlipped] = useState(false);
  const moved = useRef(false);
  const start = useRef({ x: 0, y: 0 });

  // A tap (mouse or touch) always jitters a few sub-pixels before the click
  // fires, and touch is far noisier than mouse. Only treat the pointer as
  // "moved" once it clears a real drag threshold, otherwise every tap on
  // mobile gets misread as a drag and the flip never triggers.
  const DRAG_THRESHOLD = 6;

  function handlePointerDown(e) {
    moved.current = false;
    start.current = { x: e.clientX, y: e.clientY };
  }
  function handlePointerMove(e) {
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      moved.current = true;
    }
  }
  function handleClick(e) {
    if (moved.current) return;
    e.stopPropagation();
    setFlipped((f) => !f);
  }

  const {
    name,
    price,
    currency,
    store,
    description,
    category,
    image_url,
    product_link,
    is_favorite,
    is_purchased,
    source,
    rotation,
  } = data;

  return (
    <div
      className="polaroid-wrap"
      style={{ "--rot": `${rotation || 0}deg` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onClick={handleClick}
    >
      {/* Invisible handles so React Flow treats this as a normal node; no edges are ever drawn */}
      <Handle type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: "none" }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: "none" }} />

      <div className={`polaroid${flipped ? " is-flipped" : ""}`}>
        <div className="polaroid-face polaroid-front">
          <div className="polaroid-photo">
            {image_url ? (
              <img src={image_url} alt={name} draggable={false} />
            ) : (
              <div className="polaroid-photo-placeholder" />
            )}
          </div>
          <div className="polaroid-label">
            <div className="polaroid-text">
              <div className="polaroid-name" title={name}>{name}</div>
              {price != null && (
                <div className="polaroid-price">{currency || "AED"} {price}</div>
              )}
            </div>
            {product_link && (
              <a
                className="polaroid-link"
                href={product_link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="Open source"
              >
                ↗
              </a>
            )}
          </div>
        </div>

        <div className="polaroid-face polaroid-back">
          <div className="polaroid-back-content">
            <div className="polaroid-back-name">{name}</div>
            {store && <div className="polaroid-back-row"><span>Store</span>{store}</div>}
            {category && <div className="polaroid-back-row"><span>Category</span>{category}</div>}
            {price != null && (
              <div className="polaroid-back-row"><span>Price</span>{currency || "AED"} {price}</div>
            )}
            {source && <div className="polaroid-back-row"><span>Source</span>{source}</div>}
            {description && <div className="polaroid-back-desc">{description}</div>}
            <div className="polaroid-back-badges">
              {is_favorite && <span className="badge fav">Favorite</span>}
              {is_purchased && <span className="badge purchased">Purchased</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(PolaroidNode);
