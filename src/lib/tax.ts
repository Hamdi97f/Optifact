import type { DocumentType, DraftLineItem } from '@/types/db';
import { round3 } from './utils';

/** Tunisian VAT rate. */
export const TVA_RATE = 0.19;

/** Tunisian fiscal stamp (timbre fiscal) for invoices, in TND. */
export const TIMBRE_FISCAL = 1.0;

export interface DocumentTotals {
  total_ht: number;
  tva: number;
  timbre_fiscal: number;
  total_ttc: number;
}

/**
 * Compute the totals for a document according to Tunisian tax rules.
 *
 *  - HT  = sum of qty * unit_price for each line
 *  - TVA = HT * 19%
 *  - Timbre fiscal = 1.000 TND on Invoices only (not on Quotes / Delivery / PO)
 *  - TTC = HT + TVA + Timbre
 */
export function computeTotals(items: DraftLineItem[], type: DocumentType): DocumentTotals {
  const total_ht = round3(
    items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0),
  );
  const tva = round3(total_ht * TVA_RATE);
  const timbre_fiscal = type === 'invoice' ? TIMBRE_FISCAL : 0;
  const total_ttc = round3(total_ht + tva + timbre_fiscal);
  return { total_ht, tva, timbre_fiscal, total_ttc };
}
