/**
 * Application-wide settings that drive the gestion-commerciale behaviour:
 * company info, localization, currency, document numbering, taxes, document
 * defaults, branding and a basic user/role list.
 *
 * The shape is intentionally serialisable (JSON) — it is persisted as a
 * single row in the file-backed `settings` "table" (see `src/lib/db.ts`)
 * and consumed everywhere through the `useSettings()` hook.
 */

import type { DocumentType } from './db';

export type Language = 'fr' | 'en' | 'ar';

export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

export type DecimalSeparator = ',' | '.';
export type ThousandsSeparator = ' ' | ',' | '.' | "'" | '';

export type SymbolPosition = 'prefix' | 'suffix';

export type ResetCycle = 'never' | 'yearly' | 'monthly';

/**
 * Where the default tax for a document line comes from when the user
 * doesn't pick one explicitly.
 *
 * - `'document'`  → one tax for the whole document (the settings default
 *                   for sales / purchases). Current legacy behaviour.
 * - `'item'`      → each line uses its product's `Product.tax_id`,
 *                   falling back to the settings default.
 * - `'entity'`    → all lines use the selected client/supplier's
 *                   `Entity.default_tax_id`, falling back to the settings default.
 */
export type DefaultTaxSource = 'document' | 'item' | 'entity';

export type TaxType = 'vat' | 'withholding' | 'stamp' | 'other' | 'combined';

/** How a single component of a `combined` tax computes its base. */
export type TaxComponentBase = 'HT' | 'HT_PLUS_TAXES';

/**
 * One sub-tax inside a combined tax.
 *
 * - `tax_id` references another (non-combined) `TaxRate` in `TaxSettings.rates`.
 * - When `base === 'HT'`, the component is computed on the document HT.
 * - When `base === 'HT_PLUS_TAXES'`, the component is computed on
 *   `HT + Σ(amount of each tax id listed in base_tax_ids)`. Each id MUST also
 *   be a component of the parent combined tax (cycles are broken by falling
 *   back to HT — see `computeTaxBreakdown` in `lib/tax.ts`).
 */
export interface TaxRateComponent {
  tax_id: string;
  base: TaxComponentBase;
  /** Tax ids whose amounts are added to HT to form this component's base. */
  base_tax_ids: string[];
}

export type UserRole = 'admin' | 'sales' | 'accountant' | 'viewer';

export type PdfTemplate = 'classic' | 'modern' | 'minimal';

/** Numbering counter doc types we manage (extends the base DocumentType). */
export type NumberedDocType = DocumentType | 'credit_note' | 'payment';

export interface CompanySettings {
  legal_name: string;
  trade_name: string;
  address_line1: string;
  address_line2: string;
  postal_code: string;
  city: string;
  country: string;
  /** Tunisian "Matricule Fiscal" / French SIRET / Moroccan ICE / etc. */
  tax_id: string;
  /** EU/Tunisian VAT registration number. */
  vat_number: string;
  /** Trade & companies register (RC / RCS). */
  trade_register: string;
  phone: string;
  email: string;
  website: string;
  /** Logo as a data URL (kept inline so PDF generation stays self-contained). */
  logo_data_url: string | null;
  footer_text: string;
  bank_name: string;
  bank_rib: string;
  bank_iban: string;
  bank_bic: string;
}

export interface LocalizationSettings {
  language: Language;
  /** When true the document is rendered right-to-left (Arabic). */
  rtl: boolean;
  date_format: DateFormat;
  decimal_separator: DecimalSeparator;
  thousands_separator: ThousandsSeparator;
  /** Decimal places for amounts (totals, prices). */
  amount_decimals: number;
  /** Decimal places for quantities. */
  quantity_decimals: number;
  /** Decimal places for unit prices (often more than amounts). */
  unit_price_decimals: number;
}

export interface SecondaryCurrency {
  code: string;
  symbol: string;
  /** How many `code` units equal 1 base-currency unit. */
  rate: number;
}

export interface CurrencySettings {
  /** ISO 4217 code, e.g. "TND", "EUR". */
  code: string;
  symbol: string;
  symbol_position: SymbolPosition;
  /** Optional list of secondary currencies with manual exchange rates. */
  secondary: SecondaryCurrency[];
}

export interface NumberingSequence {
  prefix: string;
  suffix: string;
  /** Pad the numeric counter to this width with leading zeros. */
  padding: number;
  reset_cycle: ResetCycle;
  /** Last allocated counter (per current period bucket). */
  next_number: number;
  /** Period bucket the counter belongs to ("YYYY", "YYYY-MM" or ""). */
  period_key: string;
}

export type NumberingSettings = Record<NumberedDocType, NumberingSequence>;

export interface TaxRate {
  id: string;
  name: string;
  /**
   * Percentage value, e.g. 19 for 19%.
   * For `combined` taxes this is informational only — the actual amount is
   * the sum of the component amounts (see `components`).
   */
  rate: number;
  type: TaxType;
  /** Optional accounting code (e.g. 4366 for VAT in France/Tunisia). */
  account_code: string;
  /**
   * Components for a `combined` tax. Required when `type === 'combined'`,
   * ignored otherwise. A combined tax may NOT reference another combined
   * tax (kept flat to avoid recursion ambiguities).
   */
  components?: TaxRateComponent[];
}

export interface TaxSettings {
  rates: TaxRate[];
  /** Id of the default tax for sales documents (quote/invoice/delivery). */
  default_sales_tax_id: string | null;
  /** Id of the default tax for purchase documents. */
  default_purchase_tax_id: string | null;
  /**
   * Where the per-line tax comes from when the user doesn't pick one.
   * See `DefaultTaxSource`. Defaults to `'document'` (legacy behaviour).
   */
  default_tax_source: DefaultTaxSource;
  /** Whether unit prices include tax by default. */
  prices_include_tax: boolean;
  /** Reverse-charge applies (B2B intra-EU, etc.). */
  reverse_charge: boolean;
  /** Country fiscal stamp ("timbre fiscal") — TN/MA/DZ. 0 disables it. */
  fiscal_stamp_amount: number;
  /** Apply the fiscal stamp on these document types only. */
  fiscal_stamp_doc_types: DocumentType[];
}

export interface DocumentDefaults {
  /** Default payment-terms label printed on documents. */
  payment_terms: string;
  /** Days added to the document date to compute the due date. */
  due_date_offset_days: number;
  /** Default note/footer per document type. */
  notes_per_type: Partial<Record<DocumentType, string>>;
  /** Block of text printed near the signature line. */
  signature_block: string;
  /** Show a "DRAFT" / "CANCELLED" watermark on PDFs. */
  watermark_drafts: boolean;
}

export interface BrandingSettings {
  /** Hex colour, e.g. "#2563eb". Applied as the primary CSS variable. */
  primary_color: string;
  pdf_template: PdfTemplate;
}

export interface UserAccount {
  id: string;
  email: string;
  role: UserRole;
  /** Free-form display name. */
  name: string;
  /**
   * UI-only invitation flag. The api-gateway does not currently support
   * server-side invites; flagging an account as `invited: true` simply
   * means the admin has noted that this user should exist.
   */
  invited: boolean;
}

export interface UsersSettings {
  accounts: UserAccount[];
}

export interface AppSettings {
  /** Schema version — bump if a future migration changes the shape. */
  version: number;
  company: CompanySettings;
  localization: LocalizationSettings;
  currency: CurrencySettings;
  numbering: NumberingSettings;
  tax: TaxSettings;
  documents: DocumentDefaults;
  branding: BrandingSettings;
  users: UsersSettings;
}
