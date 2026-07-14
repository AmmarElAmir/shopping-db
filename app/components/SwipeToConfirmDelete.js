"use client";

import { useRef, useState } from "react";

// Mobile-only swipe-to-confirm slider. Desktop keeps a plain tap button
// (rendered alongside this and toggled via CSS at the 768px breakpoint).
export default function SwipeToConfirmDelete({ onConfirm, disabled, label = "Slide to delete" }) {
  const trackRef = useRef(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const startXRef = useRef(0);
  const maxDragRef = useRef(0);

  function getMaxDrag() {
    const track = trackRef.current;
    if (!track) return 0;
    const thumb = track.querySelector(".swipe-thumb");
    const thumbWidth = thumb ? thumb.offsetWidth : 44;
    return Math.max(track.offsetWidth - thumbWidth - 6, 0);
  }

  function handlePointerDown(e) {
    if (disabled || confirmed) return;
    setDragging(true);
    startXRef.current = e.clientX;
    maxDragRef.current = getMaxDrag();
    e.target.setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e) {
    if (!dragging || disabled || confirmed) return;
    const delta = e.clientX - startXRef.current;
    const clamped = Math.min(Math.max(delta, 0), maxDragRef.current);
    setDragX(clamped);
  }

  function handlePointerUp() {
    if (!dragging || disabled || confirmed) return;
    setDragging(false);
    const threshold = maxDragRef.current * 0.85;
    if (maxDragRef.current > 0 && dragX >= threshold) {
      setConfirmed(true);
      setDragX(maxDragRef.current);
      onConfirm();
    } else {
      setDragX(0);
    }
  }

  const progress = maxDragRef.current > 0 ? dragX / maxDragRef.current : 0;

  return (
    <div
      ref={trackRef}
      className={`swipe-track${confirmed ? " confirmed" : ""}${disabled ? " disabled" : ""}`}
    >
      <span className="swipe-label" style={{ opacity: 1 - progress }}>
        {confirmed ? "Deleting…" : label}
      </span>
      <div
        className="swipe-thumb"
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragging ? "none" : "transform 0.2s ease",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="slider"
        aria-label={label}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        →
      </div>
    </div>
  );
}
