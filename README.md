# Optifact

**Optifact** is a multi-tenant SaaS ERP for small businesses. Built with React, Tailwind CSS, Shadcn-style UI, Lucide icons and the Optifact api-gateway (auth + JSON-blob storage).

## Features (initial scaffold)

- 🔐 Auth via the Optifact api-gateway (`/register`, `/login`) — session token stored in `localStorage`.
- 📊 **Dashboard** — KPI cards, Sales vs Expenses chart (recharts), low-stock alerts, quick actions, empty states & skeleton loaders.
- 🧾 **Documents** — Quotes, Invoices, Delivery notes, Purchase Orders with a shared multi-step create form and real-time totals.
- 🇹🇳 **Tunisian tax logic** — 19% TVA + 1.000 TND fiscal stamp on invoices.
- 🔁 **Quote → Invoice** in 1 click.
- 📦 **Inventory** — stock quantities are stored on the `products` records and updated client-side when documents are issued.
- 📄 **PDF generation** for all documents (jsPDF + autotable).
- 🔎 Responsive data tables with search, status filter and CSV export.
- 🧱 Modern sidebar layout, accessible UI primitives, dark-mode-ready tokens.

## Tech stack

Vite · React 18 · TypeScript · Tailwind CSS · Shadcn-style components · Lucide Icons · Recharts · jsPDF · Optifact api-gateway · React Router.

## Getting started

```bash
# 1. Install
npm install

# 2. Configure the api-gateway
cp .env.example .env
# → fill in VITE_API_GATEWAY_URL and VITE_API_GATEWAY_KEY

# 3. Run the dev server
npm run dev
```

## Project structure

```
src/
  components/
    layout/          # Sidebar, AppLayout, ProtectedRoute
    ui/              # Button, Card, Input, Table, Badge, Skeleton, EmptyState…
  hooks/             # useAuth (api-gateway session)
  lib/
    apiClient.ts     # Low-level fetch wrapper for the api-gateway
    db.ts            # JSON-blob "tables" backed by gateway file storage
    supabase.ts      # Backwards-compat façade re-exporting `db` as `supabase`
    tax.ts           # TVA 19% + 1.000 TND timbre fiscal helpers
    pdf.ts           # PDF generation for documents
    utils.ts         # cn(), formatTND(), formatDate(), round3()
  pages/
    Dashboard.tsx
    DocumentListPage.tsx       # generic list (used by Invoices, Quotes, …)
    DocumentCreatePage.tsx     # multi-step create form
    Login.tsx
    PlaceholderPage.tsx
  types/db.ts        # TypeScript types for the in-app data model
```

## Data layer

The app talks to a single api-gateway (see [API docs](https://hycvkzijiwnmcwejvugj.supabase.co/functions/v1/api-gateway)). Authentication uses `POST /register` and `POST /login`; the returned bearer token is sent as `Authorization: Bearer …` alongside `x-api-key` on every request.

Relational data (`products`, `entities`, `documents`, `doc_items`, `profiles`) is persisted as **per-user JSON files** in the gateway's file storage (`/upload-file`, `/list-files`, `/delete-file`, plus `GET /download-file?file_id=…` for reads). Each table is a single JSON blob named `optifact-table-<user_id>-<table>.json`. See `src/lib/db.ts` for the query layer (a small subset of the supabase-js builder API: `from(...).select().eq().in().gte().order().single()`, plus `insert/update/delete`).

## Tunisian tax rules

Implemented in `src/lib/tax.ts`:

- **TVA**: 19% applied on the HT total.
- **Timbre fiscal**: 1.000 TND on Invoices only (not on Quotes, Delivery notes, or Purchase Orders).
- **TTC** = HT + TVA + Timbre.

All currency values are stored and displayed with millime precision (3 decimals).

## Scripts

```bash
npm run dev         # Vite dev server
npm run build       # Type-check + production build
npm run typecheck   # Type-check only
npm run preview     # Preview the production build
```

## Roadmap

The initial scaffold focuses on the **core structure, database migration, and dashboard + invoicing logic** as requested in the architect brief. Next up: full Products / Entities / Payments CRUD pages, advanced finance reports (debt per client, ageing), document numbering sequences, company branding/settings, and emailing PDFs.
