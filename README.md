<div align="center">

# 🍼 Mom Store — Stock Management System

**An inventory manager and point-of-sale, in one web app.**
Browse your catalogue like a shop, ring up an order, and watch stock decrement
itself while a PDF invoice files into your sales history — all backed by Firebase.

![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-FFCA28?logo=firebase&logoColor=black)
![JavaScript](https://img.shields.io/badge/Vanilla-JS-F7DF1E?logo=javascript&logoColor=black)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

</div>

---

## ✨ Overview

Mom Store replaces spreadsheet-and-guesswork inventory with a single screen that
does both jobs a small shop actually needs:

- **Track stock** — products, categories, quantities, low-stock alerts.
- **Sell stock** — a built-in storefront + cart + checkout that **automatically
  subtracts what you sold** and keeps a permanent, exportable record of every sale.

It's a lightweight **vanilla-JS** app (no React/Vue, no heavy framework) bundled by
**Vite**, with **Firebase** for authentication and the database, deployable to
**Vercel** in a couple of clicks.

---

## 🚀 Features

### Inventory
- ➕ Add / ✏️ edit / 🗑️ delete products (name, category, SKU, price, cost, quantity, threshold)
- 🔎 Live search + category filtering
- 🚦 Automatic **stock status** — In stock / Low stock / Out of stock
- 🔔 Low-stock & out-of-stock **alerts** with an at-a-glance dashboard
- 📥 **CSV import** (fuzzy header matching, merges by product name) & 📤 **CSV export**

### Store & checkout
- 🛍️ **Storefront** view — shop the catalogue, add items to an order (capped at available stock)
- 🛒 **Cart** with quantity steppers and **live pricing** (always uses the current product price)
- 💳 **Atomic checkout** — a Firestore transaction validates stock, decrements it, and
  records the sale **together**, so inventory and sales can never drift apart or oversell

### Sales history & invoicing
- 🧾 Every sale stored as an **immutable invoice** (create-only audit trail)
- 📄 One-click **PDF invoice** download (jsPDF), formatted in **Tunisian Dinar (TND)**
- 📊 History dashboard: total sales, revenue, units sold, average sale

### UX
- 📱 Fully **responsive** — off-canvas drawer navigation on mobile, bottom-sheet modals
- 🖥️ **Collapsible sidebar** on desktop (remembers your choice)
- 🎞️ Smooth animations (respecting `prefers-reduced-motion`) + non-blocking toasts
- 🔐 Email/password **authentication** gate

---

## 🧱 Tech stack

| Layer | Choice |
|---|---|
| Build / dev server | **Vite 5** |
| Language | **Vanilla JavaScript** (ES modules, no framework) |
| Auth | **Firebase Authentication** (email/password) |
| Database | **Cloud Firestore** |
| PDF | **jsPDF** + **jspdf-autotable** |
| Hosting | **Vercel** |
| Currency | **TND** (3-decimal millimes) |

---

## 🏗️ Architecture

ES modules with **no globals**. All interaction is event-**delegated**: elements carry
`data-action` attributes and a single dispatcher in `main.js` routes them — no inline
`onclick`.

```
.
├── index.html              # Login screen + app shell (sidebar, 5 views, modals)
├── src/
│   ├── main.js             # Orchestrator: state, routing, rendering, all event wiring
│   ├── firebase.js         # Firebase init from env (degrades gracefully if unconfigured)
│   ├── auth.js             # Email/password sign-in/out + error messages
│   ├── db.js               # Firestore CRUD + atomic checkout() transaction + seeding
│   ├── seed-data.js        # Starter catalogue (pure data, shared with the migrate script)
│   ├── format.js           # TND/date formatting, escaping, stock status helpers
│   ├── invoice.js          # PDF invoice generation
│   └── styles.css          # Design tokens, components, responsive rules, animations
├── scripts/
│   └── migrate.mjs         # Standalone, idempotent catalogue → Firestore migration
├── firestore.rules         # Security rules (signed-in read/write; sales are create-only)
├── .env.example            # Firebase config template
└── vite.config.js
```

**Data model**

```js
// products/{id}
{ name, cat, sku, price, cost, qty, threshold }

// sales/{id}  — immutable
{ number, customer, note, createdBy, createdAt,
  items: [{ name, sku, cat, price, qty, lineTotal }],
  itemCount, subtotal, total }
```

> The cart prices from the **live product** on every render; the invoice and the stock
> decrement use values read **inside the checkout transaction** — the source of truth.

---

## 🛠️ Getting started

### Prerequisites
- **Node.js** LTS — https://nodejs.org
- A **Firebase** project — https://console.firebase.google.com

### 1. Install
```bash
git clone https://github.com/Mastersonic544/MomStore-Stock-Management-System.git
cd MomStore-Stock-Management-System
npm install
```

### 2. Configure Firebase
In the Firebase console for your project:
1. **Build → Authentication → Sign-in method →** enable **Email/Password**, then add a user.
2. **Build → Firestore Database →** create a database (Native mode).
3. **Firestore → Rules →** paste the contents of [`firestore.rules`](./firestore.rules) and **Publish**.

Then copy the env template and fill it in (Project settings → *Your apps* → SDK config):
```bash
cp .env.example .env
```
```ini
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```
> Firebase web keys are **public client identifiers** — access is controlled by Auth +
> Firestore rules, not secrecy. Still, `.env` is gitignored by default.

### 3. Run
```bash
npm run dev
```
Open the printed URL and sign in. On first sign-in with an empty database, the starter
catalogue **migrates itself** into Firestore automatically.

---

## 🌱 Seeding / migration

The app auto-seeds on first run. To migrate from the terminal instead (idempotent —
skips if products already exist):

```bash
npm run migrate -- you@example.com yourpassword
# or set MIGRATE_EMAIL / MIGRATE_PASSWORD env vars and run: npm run migrate
```

---

## ☁️ Deploy to Vercel

1. Push to GitHub and **import the repo** in Vercel (framework auto-detects as **Vite**).
2. Add the six `VITE_FIREBASE_*` keys under **Project Settings → Environment Variables**.
3. In Firebase **Auth → Settings → Authorized domains**, add your Vercel domain.
4. Deploy. Build command `vite build`, output `dist/` (both auto-detected).

---

## 📜 Scripts

| Command | Description |
|---|---|
| `npm run dev` | Local dev server with hot reload |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run migrate` | Seed the catalogue into Firestore (see above) |

---

## 🔒 Security

`firestore.rules` restricts all access to authenticated users, and makes **sales
create-only** (no edits or deletes) so the invoice history stays a trustworthy audit
trail. Any signed-in account currently has full inventory access — appropriate for a
single shared shop; role-based rules can be layered on later.

---

## 🗺️ Roadmap ideas

- Block checkout when a cart item has no price set
- Per-user roles (manager vs. cashier)
- Receipts via email
- Purchase orders / restocking workflow
- Revenue charts over time

---

## 📄 License

Released under the **MIT License** — see [`LICENSE`](./LICENSE).

<div align="center">
<sub>Built with Vite · Firebase · jsPDF</sub>
</div>
