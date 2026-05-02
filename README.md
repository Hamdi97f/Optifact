# Optifact

**Optifact** is a multi-tenant SaaS ERP for small businesses. Built with React, Tailwind CSS, Shadcn-style UI, Lucide icons and Supabase (Postgres + Auth).

## Features (initial scaffold)

- 🔐 Multi-tenant auth (Supabase) — every tenant maps to a `profiles` row enforced by Row Level Security.
- 📊 **Dashboard** — KPI cards, Sales vs Expenses chart (recharts), low-stock alerts, quick actions, empty states & skeleton loaders.
- 🧾 **Documents** — Quotes, Invoices, Delivery notes, Purchase Orders with a shared multi-step create form and real-time totals.
- 🇹🇳 **Tunisian tax logic** — 19% TVA + 1.000 TND fiscal stamp on invoices.
- 🔁 **Quote → Invoice** in 1 click.
- 📦 **Inventory engine** — Postgres triggers auto-deduct stock on Invoices/Delivery and auto-add on Purchase Orders.
- 📄 **PDF generation** for all documents (jsPDF + autotable).
- 🔎 Responsive data tables with search, status filter and CSV export.
- 🧱 Modern sidebar layout, accessible UI primitives, dark-mode-ready tokens.

## Tech stack

Vite · React 18 · TypeScript · Tailwind CSS · Shadcn-style components · Lucide Icons · Recharts · jsPDF · `@supabase/supabase-js` · React Router.

## Getting started

```bash
# 1. Install
npm install

# 2. Configure Supabase
cp .env.example .env
# → fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# 3. Apply the database migration
#    In the Supabase SQL editor, paste & run:
#      supabase/migrations/0001_init.sql
#    (or use the Supabase CLI: `supabase db push`)

# 4. Run the dev server
npm run dev
```

## Project structure

```
src/
  components/
    layout/          # Sidebar, AppLayout, ProtectedRoute
    ui/              # Button, Card, Input, Table, Badge, Skeleton, EmptyState…
  hooks/             # useAuth (Supabase session)
  lib/
    supabase.ts      # Supabase client
    tax.ts           # TVA 19% + 1.000 TND timbre fiscal helpers
    pdf.ts           # PDF generation for documents
    utils.ts         # cn(), formatTND(), formatDate(), round3()
  pages/
    Dashboard.tsx
    DocumentListPage.tsx       # generic list (used by Invoices, Quotes, …)
    DocumentCreatePage.tsx     # multi-step create form
    Login.tsx
    PlaceholderPage.tsx
  types/db.ts        # TypeScript types matching the schema
supabase/
  migrations/0001_init.sql     # Schema + RLS + inventory triggers
```

## Database schema

See [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) for the full migration. Tables: `profiles`, `products`, `entities`, `documents`, `doc_items`, `payments`. Every business table is `tenant_id`-scoped with RLS policies of the form `tenant_id = auth.uid()`. Inventory movements are handled by the `documents_stock_trigger` trigger.

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
