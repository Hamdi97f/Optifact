/**
 * Defaults + persistence for the application Settings.
 *
 * Settings live as a single row in the file-backed `settings` "table"
 * (id = `app`). On first load we merge the persisted patch over
 * `defaultSettings()` so newly-added fields gain a sensible value without
 * a manual migration.
 */

import { db } from './db';
import type {
  AppSettings,
  NumberedDocType,
  NumberingSequence,
  TaxRate,
} from '@/types/settings';

const SETTINGS_ROW_ID = 'app';
const SETTINGS_TABLE = 'settings';
const SCHEMA_VERSION = 1;

/**
 * Sensible defaults targeted at the existing Tunisian gestion-commerciale
 * setup (TND, 19% VAT, 1.000 TND fiscal stamp, fr-TN locale). Every field
 * is overridable from the Settings UI.
 */
export function defaultSettings(): AppSettings {
  const tvaId = 'tax-tva-19';
  const taxRates: TaxRate[] = [
    { id: tvaId, name: 'TVA 19%', rate: 19, type: 'vat', account_code: '4366' },
    { id: 'tax-tva-13', name: 'TVA 13%', rate: 13, type: 'vat', account_code: '4366' },
    { id: 'tax-tva-7', name: 'TVA 7%', rate: 7, type: 'vat', account_code: '4366' },
    { id: 'tax-tva-0', name: 'Exonéré (0%)', rate: 0, type: 'vat', account_code: '4366' },
  ];

  const numbering: Record<NumberedDocType, NumberingSequence> = {
    invoice: blankSeq('FAC-', 5, 'yearly'),
    quote: blankSeq('DEV-', 5, 'yearly'),
    delivery: blankSeq('BL-', 5, 'yearly'),
    purchase_order: blankSeq('BC-', 5, 'yearly'),
    credit_note: blankSeq('AV-', 5, 'yearly'),
    payment: blankSeq('PAY-', 5, 'yearly'),
  };

  return {
    version: SCHEMA_VERSION,
    company: {
      legal_name: 'My Company',
      trade_name: '',
      address_line1: '',
      address_line2: '',
      postal_code: '',
      city: '',
      country: 'Tunisia',
      tax_id: '',
      vat_number: '',
      trade_register: '',
      phone: '',
      email: '',
      website: '',
      logo_data_url: null,
      footer_text: 'Merci pour votre confiance.',
      bank_name: '',
      bank_rib: '',
      bank_iban: '',
      bank_bic: '',
    },
    localization: {
      language: 'fr',
      rtl: false,
      date_format: 'DD/MM/YYYY',
      decimal_separator: ',',
      thousands_separator: ' ',
      amount_decimals: 3,
      quantity_decimals: 3,
      unit_price_decimals: 3,
    },
    currency: {
      code: 'TND',
      symbol: 'TND',
      symbol_position: 'suffix',
      secondary: [],
    },
    numbering,
    tax: {
      rates: taxRates,
      default_sales_tax_id: tvaId,
      default_purchase_tax_id: tvaId,
      prices_include_tax: false,
      reverse_charge: false,
      fiscal_stamp_amount: 1.0,
      fiscal_stamp_doc_types: ['invoice'],
    },
    documents: {
      payment_terms: 'Paiement à 30 jours',
      due_date_offset_days: 30,
      notes_per_type: {},
      signature_block: '',
      watermark_drafts: true,
    },
    branding: {
      primary_color: '#2563eb',
      pdf_template: 'classic',
    },
    users: { accounts: [] },
  };
}

function blankSeq(prefix: string, padding: number, reset: 'never' | 'yearly' | 'monthly'): NumberingSequence {
  return {
    prefix,
    suffix: '',
    padding,
    reset_cycle: reset,
    next_number: 1,
    period_key: '',
  };
}

/* ------------------------ deep merge for forward-compat ------------------ */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Recursively merge `patch` over `base`. Arrays are replaced wholesale
 * (so the user's tax-rate list isn't accidentally combined with defaults),
 * but nested objects are merged so newly-added fields fall back to defaults.
 */
function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(patch)) return base;
  if (!isPlainObject(base)) return patch as T;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const existing = (base as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      out[key] = value;
    } else if (isPlainObject(value) && isPlainObject(existing)) {
      out[key] = deepMerge(existing, value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out as T;
}

/* --------------------------------- persistence ---------------------------- */

interface SettingsRow {
  id: string;
  data: AppSettings;
  updated_at?: string;
  created_at?: string;
}

export async function loadSettings(): Promise<AppSettings> {
  const res = await db
    .from(SETTINGS_TABLE)
    .select<SettingsRow>('*')
    .eq('id', SETTINGS_ROW_ID)
    .maybeSingle();
  if (res.error || !res.data) return defaultSettings();
  return deepMerge(defaultSettings(), res.data.data);
}

export async function saveSettings(next: AppSettings): Promise<AppSettings> {
  const existing = await db
    .from(SETTINGS_TABLE)
    .select<SettingsRow>('*')
    .eq('id', SETTINGS_ROW_ID)
    .maybeSingle();
  const payload = { id: SETTINGS_ROW_ID, data: next };
  if (existing.data) {
    await db.from(SETTINGS_TABLE).update(payload).eq('id', SETTINGS_ROW_ID);
  } else {
    await db.from(SETTINGS_TABLE).insert(payload);
  }
  return next;
}
