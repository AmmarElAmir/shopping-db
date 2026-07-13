# PLP Redesign — Handoff for Claude Code

**Status: DONE** — implemented and pushed to `main` on 2026-07-13T23:04:36+04:00 (commit `9aa8dfa`).

## Context
Source of truth: Figma file "Shopping-DB", frame `1560w default` (node `1:2`/`1:3`), file key `WenjdN51OrThM1LfLTDgCN`.
Design pulled via Figma MCP `get_design_context` on 2026-07-13. This brief + the attached
`shopping-db-redesign.zip` are the complete deliverable — no further Figma calls should be needed.

Repo: `/Users/aelamir/Documents/Claude/Projects/shopping-db` (Next.js 14, App Router, Supabase, no Tailwind — plain CSS).

## Task
1. Unzip `shopping-db-redesign.zip` and copy its contents into the repo root, overwriting:
   - `app/globals.css`
   - `app/layout.js`
   - `app/page.js`
   - `app/comparisons/page.js` (one class rename only, see below)
   - `app/add/page.js` (unchanged content, copy is fine, no-op if diff is empty)
   - `lib/supabase.js`, `package.json`, `next.config.mjs` (unchanged, copy is fine, no-op if diff is empty)
   - **New files:** `lib/NavLinks.js`, `lib/icons.js`
2. Run `npm run build` locally to confirm it compiles (no new deps were added — no `npm install` needed).
3. `git add -A && git commit -m "Redesign PLP to match Figma design" && git push`.

## What changed and why

### Design tokens (`app/globals.css`)
All colors/radii/spacing came straight off the Figma layers, exposed as CSS custom properties at
the top of the file (`--brand`, `--category-text`, `--category-bg`, `--fav-bg`, `--bought-bg`,
`--card-border`, `--radius-card`, `--radius-pill`, `--radius-round`, etc). If you touch styling
later, edit the token, not the hardcoded value — nothing in the components should have inline
hex colors anymore.

### Header (`app/layout.js` + new `lib/NavLinks.js`)
- Figma shows a sticky, floating, semi-transparent pill-shaped nav bar (border-radius 128px,
  `rgba(247,247,248,0.6)` background, blur, soft drop shadow). Implemented as `.topbar-wrap` /
  `.topbar` in globals.css.
- Active-link styling (bold, dark navy `#000d4b` vs. regular blue `#4667ff`) requires knowing the
  current route, so the nav was pulled out into a client component (`lib/NavLinks.js`) using
  `usePathname()`. `layout.js` itself is still a server component.

### Filters (`app/page.js`)
- Checkboxes → Figma's toggle-switch component (24×12 pill, sliding thumb, `.toggle-switch` /
  `.thumb` classes).
- **Behavior change, needs confirmation from Ammar:** the second toggle was renamed
  "Purchased" → **"Hide Purchased"** to match the Figma copy, and the filter logic was inverted
  (`hidePurchased` now *excludes* purchased items when on, rather than the old "purchased only"
  checkbox that *included only* purchased items). If Ammar actually wants the old "purchased
  only" behavior, just flip the condition in the `filtered` useMemo and rename the label back.
- Category `<select>` dropdown → row of pill buttons (`.category-pill` / `.category-pill.selected`),
  matching the Figma "Category pill" component (white+outline when off, solid brand blue when on).
  An "All" pill was added for reset — not present in the static Figma frame but needed for
  usability; flag to Ammar if he'd rather drop it.

### Product cards (`app/page.js`, `.card` family in `globals.css`)
Rebuilt to match the Figma "Prod Card" component 1:1:
- Image area (`aspect-ratio: 314/216`) with two tag rows absolutely positioned over it:
  - Top-left: circular icon badges — cart-check icon (green `#d7fed9`) if `is_purchased`, heart
    icon (pink `#ffe8ec`) if `is_favorite`. Only rendered when true (Figma shows both "on" as a
    static example).
  - Bottom: category pill (`#eef1ff` bg / `#3e60ff` text) + small meta icons — sparkle icon if
    `p.claude_notes` is non-empty (stand-in for Figma's "AI generated" tag), link icon if a
    `product_link`/`product_url` exists (stand-in for Figma's "Linked" tag).
- Body: title clamped to 2 lines, store + price row (price split into small "AED" + larger amount
  per Figma), description clamped to 3 lines.
- Figma's tag icons are `localhost:3845` asset URLs (Figma desktop's local dev server) and won't
  resolve outside Figma — replaced with small dependency-free inline SVGs in `lib/icons.js`
  (`IconCartCheck`, `IconHeart`, `IconSparkle`, `IconLink`). No new npm packages required.

## Explicit open questions for Ammar (don't guess, ask if it comes up)
- Confirm "Hide Purchased" inversion above is actually what he wants.
- Confirm the added "All" category pill is wanted (Figma didn't show one).
- The comparisons page used `.card-meta` before; it's renamed to `.card-store` in the new CSS
  (same visual style, just consistent naming with the product card). Purely cosmetic, no
  behavior change.

## Not touched
- Supabase schema, RLS policies, storage bucket setup — untouched.
- `app/add/page.js` form logic — untouched, still posts to `product-images` bucket (note: this is
  a pre-existing naming mismatch vs. the `product-photos` bucket used elsewhere; not part of this
  redesign, flagged separately).
