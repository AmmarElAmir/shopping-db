"use client";

import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Products" },
  { href: "/comparisons", label: "Comparisons" },
  { href: "/add", label: "Add product" },
];

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="nav-links">
      {LINKS.map((link) => (
        <a key={link.href} href={link.href} className={pathname === link.href ? "active" : ""}>
          {link.label}
        </a>
      ))}
    </nav>
  );
}
