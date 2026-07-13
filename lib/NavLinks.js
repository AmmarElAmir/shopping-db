"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { IconMenu, IconX } from "./icons";

const LINKS = [
  { href: "/", label: "Products" },
  { href: "/comparisons", label: "Comparisons" },
  { href: "/add", label: "Add product" },
];

export default function NavLinks() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav className="nav-links">
        {LINKS.map((link) => (
          <a key={link.href} href={link.href} className={pathname === link.href ? "active" : ""}>
            {link.label}
          </a>
        ))}
      </nav>

      <button type="button" className="menu-btn" aria-label="Open menu" onClick={() => setOpen(true)}>
        <IconMenu />
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
              </nav>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
