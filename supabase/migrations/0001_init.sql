-- =============================================================================
-- Optifact — Multi-Tenant SaaS ERP — Initial Schema
-- =============================================================================
-- This migration creates the full database schema described in the architect
-- brief, with multi-tenant isolation enforced by Row Level Security (RLS) on
-- every table. Each row is scoped to a `tenant_id` that maps 1:1 with the
-- authenticated user (auth.uid()). Inventory adjustments are handled by
-- triggers so stock stays consistent regardless of the calling client.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------- ENUMS ------------------------------------------------------------

do $$ begin
  create type entity_type as enum ('client', 'supplier');
exception when duplicate_object then null; end $$;

do $$ begin
  create type document_type as enum ('quote', 'invoice', 'delivery', 'purchase_order');
exception when duplicate_object then null; end $$;

do $$ begin
  create type document_status as enum ('draft', 'issued', 'paid', 'partially_paid', 'cancelled', 'converted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('cash', 'bank_transfer', 'check', 'card', 'other');
exception when duplicate_object then null; end $$;

-- ---------- PROFILES ---------------------------------------------------------
-- One profile per authenticated user; acts as the tenant.

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  company_name  text not null default 'My Company',
  logo          text,
  settings      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- PRODUCTS ---------------------------------------------------------

create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.profiles(id) on delete cascade,
  name              text not null,
  sku               text,
  purchase_price    numeric(14,3) not null default 0,
  sale_price        numeric(14,3) not null default 0,
  stock_qty         numeric(14,3) not null default 0,
  min_stock_alert   numeric(14,3) not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, sku)
);

create index if not exists products_tenant_idx on public.products(tenant_id);

-- ---------- ENTITIES (clients & suppliers) -----------------------------------

create table if not exists public.entities (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.profiles(id) on delete cascade,
  type        entity_type not null,
  name        text not null,
  phone       text,
  address     text,
  tax_id      text,
  email       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists entities_tenant_idx on public.entities(tenant_id);
create index if not exists entities_type_idx on public.entities(tenant_id, type);

-- ---------- DOCUMENTS --------------------------------------------------------
-- Quotes, Invoices, Delivery notes, Purchase Orders.

create table if not exists public.documents (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.profiles(id) on delete cascade,
  type            document_type not null,
  status          document_status not null default 'draft',
  number          text,
  date            date not null default current_date,
  client_id       uuid references public.entities(id) on delete set null,
  total_ht        numeric(14,3) not null default 0,
  tva             numeric(14,3) not null default 0,
  timbre_fiscal   numeric(14,3) not null default 0,
  total_ttc       numeric(14,3) not null default 0,
  notes           text,
  source_doc_id   uuid references public.documents(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists documents_tenant_idx on public.documents(tenant_id);
create index if not exists documents_type_status_idx on public.documents(tenant_id, type, status);
create index if not exists documents_client_idx on public.documents(client_id);

-- ---------- DOC ITEMS --------------------------------------------------------

create table if not exists public.doc_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.profiles(id) on delete cascade,
  doc_id      uuid not null references public.documents(id) on delete cascade,
  product_id  uuid references public.products(id) on delete set null,
  description text,
  qty         numeric(14,3) not null default 1,
  unit_price  numeric(14,3) not null default 0,
  line_total  numeric(14,3) generated always as (qty * unit_price) stored,
  created_at  timestamptz not null default now()
);

create index if not exists doc_items_doc_idx on public.doc_items(doc_id);
create index if not exists doc_items_tenant_idx on public.doc_items(tenant_id);

-- ---------- PAYMENTS ---------------------------------------------------------

create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.profiles(id) on delete cascade,
  doc_id      uuid not null references public.documents(id) on delete cascade,
  amount      numeric(14,3) not null,
  method      payment_method not null default 'cash',
  date        date not null default current_date,
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists payments_tenant_idx on public.payments(tenant_id);
create index if not exists payments_doc_idx on public.payments(doc_id);

-- =============================================================================
-- INVENTORY ENGINE — automatic stock movement triggers
-- =============================================================================
-- Rules:
--   * Issuing an Invoice or Delivery deducts product stock.
--   * Issuing a Purchase Order adds to product stock.
--   * Cancelling a previously-issued document reverses its movement.
--   * Drafts do not affect stock until they transition to "issued".
-- =============================================================================

create or replace function public.apply_stock_movement(
  p_doc_id uuid,
  p_direction int  -- +1 to add to stock, -1 to deduct
) returns void
language plpgsql
as $$
declare
  v_type document_type;
  v_sign int;
begin
  select type into v_type from public.documents where id = p_doc_id;
  if v_type is null then
    return;
  end if;

  -- Direction sign per document type
  if v_type in ('invoice', 'delivery') then
    v_sign := -1 * p_direction;
  elsif v_type = 'purchase_order' then
    v_sign := 1 * p_direction;
  else
    return; -- quotes never move stock
  end if;

  update public.products p
     set stock_qty = stock_qty + (v_sign * di.qty),
         updated_at = now()
    from public.doc_items di
   where di.doc_id = p_doc_id
     and di.product_id = p.id;
end;
$$;

create or replace function public.documents_stock_trigger()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') then
    if new.status in ('issued', 'paid', 'partially_paid') then
      perform public.apply_stock_movement(new.id, 1);
    end if;
    return new;
  end if;

  if (tg_op = 'UPDATE') then
    -- transition into an "active" state -> apply movement
    if old.status not in ('issued', 'paid', 'partially_paid')
       and new.status in ('issued', 'paid', 'partially_paid') then
      perform public.apply_stock_movement(new.id, 1);
    end if;
    -- transition out of an "active" state -> reverse movement
    if old.status in ('issued', 'paid', 'partially_paid')
       and new.status not in ('issued', 'paid', 'partially_paid') then
      perform public.apply_stock_movement(new.id, -1);
    end if;
    return new;
  end if;

  if (tg_op = 'DELETE') then
    if old.status in ('issued', 'paid', 'partially_paid') then
      perform public.apply_stock_movement(old.id, -1);
    end if;
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_documents_stock on public.documents;
create trigger trg_documents_stock
  after insert or update of status or delete on public.documents
  for each row execute function public.documents_stock_trigger();

-- =============================================================================
-- AUTH HOOK — auto-create a profile (tenant) for every new auth.users row
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, company_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'company_name', 'My Company'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- ROW LEVEL SECURITY — strict multi-tenant isolation
-- =============================================================================

alter table public.profiles  enable row level security;
alter table public.products  enable row level security;
alter table public.entities  enable row level security;
alter table public.documents enable row level security;
alter table public.doc_items enable row level security;
alter table public.payments  enable row level security;

-- Profiles: a user can read & update only their own profile.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Generic tenant-scoped policy template applied to every business table.
do $$
declare
  t text;
begin
  foreach t in array array['products','entities','documents','doc_items','payments']
  loop
    execute format('drop policy if exists "%1$s_tenant_select" on public.%1$s;', t);
    execute format(
      'create policy "%1$s_tenant_select" on public.%1$s for select using (tenant_id = auth.uid());', t);

    execute format('drop policy if exists "%1$s_tenant_insert" on public.%1$s;', t);
    execute format(
      'create policy "%1$s_tenant_insert" on public.%1$s for insert with check (tenant_id = auth.uid());', t);

    execute format('drop policy if exists "%1$s_tenant_update" on public.%1$s;', t);
    execute format(
      'create policy "%1$s_tenant_update" on public.%1$s for update using (tenant_id = auth.uid()) with check (tenant_id = auth.uid());', t);

    execute format('drop policy if exists "%1$s_tenant_delete" on public.%1$s;', t);
    execute format(
      'create policy "%1$s_tenant_delete" on public.%1$s for delete using (tenant_id = auth.uid());', t);
  end loop;
end $$;
