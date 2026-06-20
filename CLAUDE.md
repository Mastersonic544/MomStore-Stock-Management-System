# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **Vite + vanilla JS** web app that is both an inventory manager and a point-of-sale
("Store"). Backend is **Firebase** (email/password Auth + Firestore); deploy target is
**Vercel**. There is no framework and no component library — just ES modules, one
`index.html`, and one stylesheet. Currency is **TND** (3 decimals).

> History: this began as an Electron desktop app. It was rewritten into a web app; the
> Electron `main.js`/`preload.js` and the old `src/index.html` are gone.

## Commands

```bash
npm install
npm run dev       # Vite dev server (hot reload)
npm run build     # production build -> dist/
npm run preview   # serve the built dist/
```

No tests, linter, or type checker are configured. Verify changes by running `npm run build`
(catches import/syntax errors) and `npm run dev`.

## Firebase / env

- Config comes from `.env` via Vite env vars (`VITE_FIREBASE_*`). `.env` is gitignored;
  `.env.example` documents the keys. In Vercel, the same keys go in project env vars.
- `src/firebase.js` exposes `isConfigured`. When the env is blank it stays `false` and the
  app degrades gracefully (login disabled, setup notice shown) instead of crashing — keep
  that behavior when touching boot code.
- `firestore.rules` is the source of truth for access: any signed-in user can read/write
  `products`; `sales` are create + read only (immutable audit trail).

## Architecture

ES modules with **no globals**. All DOM interaction is **delegated**: elements carry
`data-action` (and optionally `data-id` / `data-view` / `data-cat`) attributes, and a single
click listener in `main.js` dispatches to an `actions` map. When adding a button, give it a
`data-action` and add a handler to that map — do **not** use inline `onclick`.

Module map:
- **`src/firebase.js`** — initializes Firebase from env; exports `auth`, `db`, `isConfigured`.
- **`src/auth.js`** — email/password sign-in/out, auth-state watcher, error-message mapping.
- **`src/db.js`** — the Firestore data layer + seed catalogue. Granular per-document CRUD
  (no whole-collection blob writes). Key export: **`checkout()`** runs a Firestore
  *transaction* that re-reads each product, validates stock, then writes the decrements and
  the sale record together — so stock and sales can never drift apart. `cleanProduct()`
  sanitizes every write.
- **`src/format.js`** — `esc`, `fmtTND` (3-decimal TND), `fmtDate` (handles Firestore
  Timestamp / Date / millis), and `status()`/`badge()` — the single source of truth for
  stock state (`out` / `low` / `ok`).
- **`src/invoice.js`** — `downloadInvoice(sale)` builds the PDF via jsPDF + autotable.
- **`src/main.js`** — the orchestrator: `state` object, auth gate, view routing (`setView`),
  per-view render functions, cart logic (persisted to `localStorage`), checkout flow, CSV
  import/export, and all event wiring.
- **`index.html`** — login screen + app shell (sidebar + 5 views + modals).
- **`src/styles.css`** — design tokens + components, responsive rules, animations.

### Data flow rules

- `state.products` / `state.sales` (in `main.js`) are the render source. After any Firestore
  mutation, **re-fetch** (`db.fetchProducts()` / `db.fetchSales()`) and call `refresh()` /
  the relevant `render*()`. Don't hand-patch local arrays as the primary path.
- Stock is decremented **only** in `db.checkout()`. Don't add side-channel quantity writes.
- The cart stores a price snapshot for display, but the **invoice/decrement use live product
  data** read inside the checkout transaction — that's intentional.
- On first sign-in with an empty `products` collection, `main.js` auto-seeds `db.SEED` (the
  migrated starter catalogue). Edit the catalogue in `db.js`.

### UI conventions

- Sidebar collapses on desktop (`.layout.collapsed`, persisted to `localStorage`) and becomes
  an off-canvas drawer on mobile (`.layout.nav-open`). A hamburger button is injected into
  every `.topbar` from `main.js`; the `.nav-label` spans are what get hidden when collapsed.
- Animations live in `styles.css` and are disabled under `prefers-reduced-motion`.
- Use the `toast()` helper for non-blocking feedback; keep `confirm()` for destructive actions.
