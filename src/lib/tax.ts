import type { DocumentType, DraftLineItem } from '@/types/db';
import type { AppSettings } from '@/types/settings';
import { round3 } from './utils';
import { roundTo } from './format';

/**
 * @deprecated Read the rate from `useSettings()` / `AppSettings.tax` instead.
 * Kept as a constant fallback for the (legacy) Tunisian default of 19% VAT.
 */
export const TVA_RATE = 0.19;

/**
 * @deprecated Read from `AppSettings.tax.fiscal_stamp_amount` instead.
 * Kept for backwards compatibility with the original Tunisian default.
 */
export const TIMBRE_FISCAL = 1.0;

export interface DocumentTotals {
  total_ht: number;
  tva: number;
  timbre_fiscal: number;
  total_ttc: number;
}

interface ComputeOptions {
  /** Active settings — provides VAT rate, decimals, fiscal stamp. */
  settings?: AppSettings;
  /** Override the tax rate (decimal, e.g. 0.19). Defaults to settings sales tax. */
  taxRate?: number;
}

function selectedTaxRate(settings: AppSettings, type: DocumentType): number {
  const taxId =
    type === 'purchase_order'
      ? settings.tax.default_purchase_tax_id
      : settings.tax.default_sales_tax_id;
  const found = settings.tax.rates.find((r) => r.id === taxId);
  return (found?.rate ?? 0) / 100;
}

function selectedFiscalStamp(settings: AppSettings, type: DocumentType): number {
  if (settings.tax.fiscal_stamp_amount <= 0) return 0;
  return settings.tax.fiscal_stamp_doc_types.includes(type)
    ? settings.tax.fiscal_stamp_amount
    : 0;
}

/**
 * Compute the totals for a document.
 *
 *  - HT  = sum of qty * unit_price for each line
 *  - TVA = HT * tax rate (from settings, falls back to legacy 19%)
 *  - Timbre fiscal = settings amount, on the configured doc types
 *  - TTC = HT + TVA + Timbre
 */
export function computeTotals(
  items: DraftLineItem[],
  type: DocumentType,
  options: ComputeOptions = {},
): DocumentTotals {
  const { settings } = options;
  const decimals = settings?.localization.amount_decimals ?? 3;
  const round = (v: number) => (settings ? roundTo(v, decimals) : round3(v));

  const rate =
    options.taxRate ??
    (settings ? selectedTaxRate(settings, type) : TVA_RATE);

  const timbre = settings ? selectedFiscalStamp(settings, type) : type === 'invoice' ? TIMBRE_FISCAL : 0;

  const total_ht = round(
    items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0),
  );
  const tva = round(total_ht * rate);
  const timbre_fiscal = round(timbre);
  const total_ttc = round(total_ht + tva + timbre_fiscal);
  return { total_ht, tva, timbre_fiscal, total_ttc };
}

/** Effective VAT rate (decimal) used for `type` given current settings. */
export function effectiveTaxRate(settings: AppSettings, type: DocumentType): number {
  return selectedTaxRate(settings, type);
}

/** Effective fiscal stamp amount for `type` given current settings. */
export function effectiveFiscalStamp(settings: AppSettings, type: DocumentType): number {
  return selectedFiscalStamp(settings, type);
}
