export type EntityType = 'client' | 'supplier';

export type DocumentType = 'quote' | 'invoice' | 'delivery' | 'purchase_order';

export type DocumentStatus =
  | 'draft'
  | 'issued'
  | 'paid'
  | 'partially_paid'
  | 'cancelled'
  | 'converted';

export type PaymentMethod = 'cash' | 'bank_transfer' | 'check' | 'card' | 'other';

export interface Profile {
  id: string;
  company_name: string;
  logo: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  tenant_id: string;
  name: string;
  sku: string | null;
  purchase_price: number;
  sale_price: number;
  stock_qty: number;
  min_stock_alert: number;
  /**
   * Default tax rate id for this product (references `TaxRate.id`).
   * Used when `TaxSettings.default_tax_source === 'item'` to pick the per-line
   * tax. Falls back to the settings default tax when null.
   */
  tax_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Entity {
  id: string;
  tenant_id: string;
  type: EntityType;
  name: string;
  phone: string | null;
  address: string | null;
  tax_id: string | null;
  email: string | null;
  /**
   * Tax rate ids this entity is exonerated from. When a document is created
   * for this entity, any matching tax (or matching component of a combined
   * tax) is automatically skipped from the totals.
   */
  tax_exemptions?: string[];
  /**
   * Default tax rate id for this entity (references `TaxRate.id`).
   * Used when `TaxSettings.default_tax_source === 'entity'` to pick the
   * per-line tax. Falls back to the settings default tax when null.
   */
  default_tax_id?: string | null;
}

export interface DocItem {
  id: string;
  tenant_id: string;
  doc_id: string;
  product_id: string | null;
  description: string | null;
  qty: number;
  unit_price: number;
  /**
   * Tax rate id applied to this line (references `TaxRate.id`). Persisted
   * so the PDF can render the tax beside each line and totals can be
   * recomputed deterministically. Optional for legacy rows.
   */
  tax_id?: string | null;
  line_total: number;
}

export interface DocumentRecord {
  id: string;
  tenant_id: string;
  type: DocumentType;
  status: DocumentStatus;
  number: string | null;
  date: string;
  client_id: string | null;
  total_ht: number;
  tva: number;
  timbre_fiscal: number;
  total_ttc: number;
  notes: string | null;
  source_doc_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  tenant_id: string;
  doc_id: string;
  amount: number;
  method: PaymentMethod;
  date: string;
  notes: string | null;
}

/** Lightweight in-memory line used by the multi-step form before saving. */
export interface DraftLineItem {
  product_id: string | null;
  description: string;
  qty: number;
  unit_price: number;
  /** Optional explicit tax rate id for this line (overrides the resolver). */
  tax_id?: string | null;
}
