"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { IconX } from "./icons";
import BulkPasteModal from "../app/components/BulkPasteModal";

const LINKS = [
  { href: "/", label: "Products" },
  { href: "/comparisons", label: "Comparisons" },
  { href: "/add", label: "Add product" },
  { href: "/canvas", label: "Canvas" },
];

export default function NavLinks() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [bulkPasteOpen, setBulkPasteOpen] = useState(false);

  return (
    <>
      <nav className="nav-links">
        {LINKS.map((link) => (
          <a key={link.href} href={link.href} className={pathname === link.href ? "active" : ""}>
            {link.label}
          </a>
        ))}
        <button type="button" className="nav-action" onClick={() => setBulkPasteOpen(true)}>
          Bulk Paste
        </button>
        <img className="nav-icon-desktop" src="/icons/nav-icon.png" alt="" />
      </nav>

      <button type="button" className="menu-btn" aria-label="Open menu" onClick={() => setOpen(true)}>
        <img src="/icons/nav-icon.png" alt="" />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="drawer-overlay" onClick={() => setOpen(false)}>
            <div className="drawer" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="drawer-close" aria-label="Close menu" onClick={() => setOpen(false)}>
                <IconX />
              </button>
              <nav className="drawer-links">
                {LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className={pathname === link.href ? "active" : ""}
                    onClick={() => setOpen(false)}
                  >
                    {link.label}
                  </a>
                ))}
                <button
                  type="button"
                  className="nav-action"
                  onClick={() => {
                    setOpen(false);
                    setBulkPasteOpen(true);
                  }}
                >
                  Bulk Paste
                </button>
              </nav>
            </div>
          </div>,
          document.body
        )}

      {typeof document !== "undefined" &&
        createPortal(
          <BulkPasteModal open={bulkPasteOpen} onClose={() => setBulkPasteOpen(false)} />,
          document.body
        )}
    </>
  );
}
