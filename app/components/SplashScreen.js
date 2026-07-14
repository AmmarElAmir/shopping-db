"use client";

import { useEffect, useState } from "react";

const FLOWER_EMOJIS = ["🌸", "🌷", "🌺", "🌼", "🌹", "💮"];

function makeFlowers(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    emoji: FLOWER_EMOJIS[Math.floor(Math.random() * FLOWER_EMOJIS.length)],
    left: Math.random() * 100,
    size: 16 + Math.random() * 22,
    duration: 5 + Math.random() * 6,
    delay: Math.random() * 4,
    rotate: Math.random() > 0.5 ? 1 : -1,
  }));
}

export default function SplashScreen() {
  const [visible, setVisible] = useState(true);
  const [closing, setClosing] = useState(false);
  const [flowers] = useState(() => makeFlowers(28));

  useEffect(() => {
    const dismissTimer = setTimeout(() => setClosing(true), 4200);
    return () => clearTimeout(dismissTimer);
  }, []);

  useEffect(() => {
    if (!closing) return;
    const removeTimer = setTimeout(() => setVisible(false), 600);
    return () => clearTimeout(removeTimer);
  }, [closing]);

  if (!visible) return null;

  function handleDismiss() {
    setClosing(true);
  }

  return (
    <div
      className={`splash-overlay${closing ? " closing" : ""}`}
      onClick={handleDismiss}
      role="button"
      aria-label="Dismiss welcome screen"
    >
      <div className="flowers">
        {flowers.map((f) => (
          <span
            key={f.id}
            className="flower"
            style={{
              left: `${f.left}%`,
              fontSize: `${f.size}px`,
              animationDuration: `${f.duration}s`,
              animationDelay: `${f.delay}s`,
              ["--rot"]: f.rotate,
            }}
          >
            {f.emoji}
          </span>
        ))}
      </div>

      <div className="splash-text-wrap">
        <span className="sparkle sparkle-1">✨</span>
        <span className="sparkle sparkle-2">✨</span>
        <span className="sparkle sparkle-3">✨</span>
        <span className="sparkle sparkle-4">✨</span>
        <h1 className="splash-text">welcome louly to the land of the bululu 💞</h1>
      </div>

      <style jsx>{`
        .splash-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at 50% 40%, #fff5f9 0%, #ffe3ef 55%, #ffd3e6 100%);
          overflow: hidden;
          cursor: pointer;
          opacity: 1;
          transition: opacity 0.6s ease;
        }
        .splash-overlay.closing {
          opacity: 0;
          pointer-events: none;
        }
        .flowers {
          position: absolute;
          inset: 0;
        }
        .flower {
          position: absolute;
          top: -10%;
          animation-name: fall;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          will-change: transform;
        }
        @keyframes fall {
          0% {
            transform: translateY(-10vh) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          100% {
            transform: translateY(110vh) rotate(calc(360deg * var(--rot)));
            opacity: 0.9;
          }
        }
        .splash-text-wrap {
          position: relative;
          padding: 40px;
          text-align: center;
        }
        .splash-text {
          position: relative;
          z-index: 2;
          color: #ff8fc0;
          font-size: clamp(28px, 6vw, 52px);
          font-weight: 700;
          text-align: center;
          text-shadow: 0 2px 18px rgba(255, 143, 192, 0.45);
          margin: 0;
          letter-spacing: 0.5px;
        }
        .sparkle {
          position: absolute;
          font-size: 26px;
          animation: flicker 1.6s ease-in-out infinite;
        }
        .sparkle-1 { top: -10px; left: 5%; animation-delay: 0s; }
        .sparkle-2 { top: 10%; right: 2%; animation-delay: 0.4s; }
        .sparkle-3 { bottom: -6px; left: 20%; animation-delay: 0.8s; }
        .sparkle-4 { bottom: 4%; right: 15%; animation-delay: 1.2s; }
        @keyframes flicker {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.15); }
        }
      `}</style>
    </div>
  );
}
