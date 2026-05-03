import type { DocumentType, DraftLineItem, Entity } from '@/types/db';
import type { AppSettings, TaxRate } from '@/types/settings';
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

/** A single computed tax line (one row in the totals breakdown). */
export interface TaxLine {
  /** Underlying TaxRate id. */
  id: string;
  name: string;
  /** Percentage (e.g. 19 for 19%). */
  rate: number;
  /** Base amount this tax was computed on. */
  base: number;
  /** Tax amount = base * rate / 100 (already rounded). */
  amount: number;
  /** Source: `'simple'` for stand-alone, `'combined'` for components inside a combined tax. */
  source: 'simple' | 'combined';
}

export interface DocumentTotals {
  total_ht: number;
  /** Sum of all tax lines (legacy field — kept for backwards compatibility). */
  tva: number;
  timbre_fiscal: number;
  total_ttc: number;
  /** Per-tax breakdown — empty when fully exempt. */
  taxes: TaxLine[];
}

interface ComputeOptions {
  /** Active settings — provides VAT rate, decimals, fiscal stamp. */
  settings?: AppSettings;
  /**
   * Override the (single) tax rate (decimal, e.g. 0.19). Defaults to the
   * settings-selected tax. Ignored when the selected tax is a combined tax
   * — combined taxes always go through their components.
   */
  taxRate?: number;
  /** Customer (or supplier) — used to honour `tax_exemptions`. */
  client?: Entity | null;
  /**
   * Product catalogue keyed by id, used to resolve `Product.tax_id` when
   * `default_tax_source === 'item'`. Optional — missing products fall back
   * to the settings default.
   */
  productsById?: Record<string, { tax_id?: string | null } | undefined>;
}

function selectedTaxId(settings: AppSettings, type: DocumentType): string | null {
  return type === 'purchase_order'
    ? settings.tax.default_purchase_tax_id
    : settings.tax.default_sales_tax_id;
}

function findRate(settings: AppSettings, id: string | null | undefined): TaxRate | undefined {
  if (!id) return undefined;
  return settings.tax.rates.find((r) => r.id === id);
}

function selectedTaxRate(settings: AppSettings, type: DocumentType): number {
  const found = findRate(settings, selectedTaxId(settings, type));
  return (found?.rate ?? 0) / 100;
}

function selectedFiscalStamp(settings: AppSettings, type: DocumentType): number {
  if (settings.tax.fiscal_stamp_amount <= 0) return 0;
  return settings.tax.fiscal_stamp_doc_types.includes(type)
    ? settings.tax.fiscal_stamp_amount
    : 0;
}

function isExempt(client: Entity | null | undefined, taxId: string): boolean {
  return Array.isArray(client?.tax_exemptions) && client.tax_exemptions.includes(taxId);
}

/**
 * Resolve which tax id should apply to a single line, given the active
 * `default_tax_source` and the available context (product, client). An
 * explicit `item.tax_id` always wins so the user can override per line.
 *
 * Returns `null` when no tax applies (e.g. no default configured anywhere).
 */
export function resolveLineTaxId(
  item: { tax_id?: string | null; product_id?: string | null },
  type: DocumentType,
  settings: AppSettings,
  options: { product?: { tax_id?: string | null } | null; client?: Entity | null } = {},
): string | null {
  if (item.tax_id !== undefined && item.tax_id !== null) return item.tax_id;
  const source = settings.tax.default_tax_source ?? 'document';
  const fallback = selectedTaxId(settings, type);
  if (source === 'item') {
    const productTax = options.product?.tax_id ?? null;
    return productTax || fallback;
  }
  if (source === 'entity') {
    const entityTax = options.client?.default_tax_id ?? null;
    return entityTax || fallback;
  }
  return fallback;
}

/**
 * Compute the breakdown of taxes for a document.
 *
 * - Resolves the document's selected tax (sales / purchase default).
 * - For a combined tax, walks its components in dependency order so that
 *   `HT_PLUS_TAXES` bases see the right "previous tax" amounts. Cycles
 *   (or unknown referenced ids) are broken by treating the offender as a
 *   plain HT-based component.
 * - Skips any component (or simple tax) whose `tax_id` is listed in the
 *   client's `tax_exemptions`.
 */
export function computeTaxBreakdown(
  ht: number,
  settings: AppSettings,
  type: DocumentType,
  client?: Entity | null,
  options: { taxRate?: number } = {},
): TaxLine[] {
  const selectedId = selectedTaxId(settings, type);
  return computeBreakdownForTax(ht, settings, selectedId, client, options);
}

/**
 * Compute the breakdown for an explicit tax id over a given HT base.
 * Handles simple taxes (with optional `taxRate` override), combined taxes
 * (with components walked in dependency order), and customer exemptions.
 * Returns an empty array when the tax id is unknown / fully exempt.
 */
export function computeBreakdownForTax(
  ht: number,
  settings: AppSettings,
  taxId: string | null | undefined,
  client?: Entity | null,
  options: { taxRate?: number } = {},
): TaxLine[] {
  const decimals = settings.localization.amount_decimals;
  const round = (v: number) => roundTo(v, decimals);

  const selected = findRate(settings, taxId);

  // No configured tax — fall back to the explicit override (legacy behaviour).
  if (!selected) {
    if (typeof options.taxRate === 'number' && options.taxRate > 0) {
      return [
        {
          id: 'override',
          name: 'TAX',
          rate: options.taxRate * 100,
          base: ht,
          amount: round(ht * options.taxRate),
          source: 'simple',
        },
      ];
    }
    return [];
  }

  // Simple (non-combined) tax: one line, possibly exempted, possibly overridden.
  if (selected.type !== 'combined' || !selected.components || selected.components.length === 0) {
    if (isExempt(client, selected.id)) return [];
    const ratePct =
      typeof options.taxRate === 'number'
        ? options.taxRate * 100
        : Number(selected.rate) || 0;
    return [
      {
        id: selected.id,
        name: selected.name,
        rate: ratePct,
        base: ht,
        amount: round(ht * (ratePct / 100)),
        source: 'simple',
      },
    ];
  }

  // Combined tax: resolve components in dependency order.
  const components = selected.components.filter((c) => {
    if (isExempt(client, c.tax_id)) return false;
    const ref = findRate(settings, c.tax_id);
    // Disallow nested combined taxes (silently drop) to avoid recursion.
    if (!ref || ref.type === 'combined') return false;
    return true;
  });

  // Map of tax_id → final TaxLine (computed in topological order).
  const computed: Record<string, TaxLine> = {};
  const order: string[] = [];
  const visiting = new Set<string>();

  function visit(id: string): void {
    if (computed[id]) return;
    if (visiting.has(id)) return; // cycle — leave to be computed as HT
    visiting.add(id);
    const comp = components.find((c) => c.tax_id === id);
    if (!comp) {
      visiting.delete(id);
      return;
    }
    if (comp.base === 'HT_PLUS_TAXES') {
      for (const dep of comp.base_tax_ids) {
        if (dep !== id) visit(dep);
      }
    }
    const ref = findRate(settings, id)!;
    let base = ht;
    if (comp.base === 'HT_PLUS_TAXES') {
      for (const dep of comp.base_tax_ids) {
        const depLine = computed[dep];
        if (depLine) base += depLine.amount;
      }
    }
    base = round(base);
    const ratePct = Number(ref.rate) || 0;
    computed[id] = {
      id: ref.id,
      name: ref.name,
      rate: ratePct,
      base,
      amount: round(base * (ratePct / 100)),
      source: 'combined',
    };
    order.push(id);
    visiting.delete(id);
  }

  for (const c of components) visit(c.tax_id);

  // Preserve the user-defined order from the components array (not the
  // dependency-driven `order`) so the breakdown matches what the admin set up.
  return components
    .map((c) => computed[c.tax_id])
    .filter((line): line is TaxLine => Boolean(line));
}

/**
 * Compute the totals for a document.
 *
 *  - HT  = sum of qty * unit_price for each line
 *  - Taxes = breakdown returned by `computeTaxBreakdown` (document scope) or
 *            per-line groups merged into one breakdown per tax id (item /
 *            entity scopes)
 *  - tva = sum of all tax-line amounts (kept for the persisted column)
 *  - Timbre fiscal = settings amount, on the configured doc types
 *  - TTC = HT + Σtaxes + Timbre
 */
export function computeTotals(
  items: DraftLineItem[],
  type: DocumentType,
  options: ComputeOptions = {},
): DocumentTotals {
  const { settings, client, productsById } = options;
  const decimals = settings?.localization.amount_decimals ?? 3;
  const round = (v: number) => (settings ? roundTo(v, decimals) : round3(v));

  const lineHt = (it: DraftLineItem) =>
    (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
  const total_ht = round(items.reduce((sum, it) => sum + lineHt(it), 0));

  let taxes: TaxLine[] = [];
  let tvaTotal = 0;

  if (settings) {
    const source = settings.tax.default_tax_source ?? 'document';
    if (source === 'document') {
      taxes = computeTaxBreakdown(total_ht, settings, type, client, {
        taxRate: options.taxRate,
      });
    } else {
      // Group line HTs by their resolved tax id, then run the breakdown
      // per group and merge identical tax lines.
      const bases = new Map<string, number>();
      for (const it of items) {
        const product =
          it.product_id && productsById ? productsById[it.product_id] : undefined;
        const taxId = resolveLineTaxId(it, type, settings, { product, client });
        const key = taxId ?? '';
        bases.set(key, (bases.get(key) ?? 0) + lineHt(it));
      }
      const merged = new Map<string, TaxLine>();
      for (const [key, base] of bases) {
        const taxId = key === '' ? null : key;
        const lines = computeBreakdownForTax(round(base), settings, taxId, client);
        for (const line of lines) {
          const existing = merged.get(line.id);
          if (existing) {
            merged.set(line.id, {
              ...existing,
              base: round(existing.base + line.base),
              amount: round(existing.amount + line.amount),
            });
          } else {
            merged.set(line.id, line);
          }
        }
      }
      taxes = Array.from(merged.values());
    }
    tvaTotal = round(taxes.reduce((s, l) => s + l.amount, 0));
  } else {
    // Legacy code path used by call sites that don't pass settings (tests, etc.).
    const rate = options.taxRate ?? TVA_RATE;
    tvaTotal = round(total_ht * rate);
    if (rate > 0) {
      taxes = [
        { id: 'legacy', name: 'TVA', rate: rate * 100, base: total_ht, amount: tvaTotal, source: 'simple' },
      ];
    }
  }

  const timbre = settings ? selectedFiscalStamp(settings, type) : type === 'invoice' ? TIMBRE_FISCAL : 0;
  const timbre_fiscal = round(timbre);
  const total_ttc = round(total_ht + tvaTotal + timbre_fiscal);
  return { total_ht, tva: tvaTotal, timbre_fiscal, total_ttc, taxes };
}

/**
 * Compute a per-line tax label for display next to each item line. Returns
 * one string per item in the same order — empty string when the line has
 * no applicable tax (unknown id or fully exempt).
 */
export function computeLineTaxLabels(
  items: DraftLineItem[],
  type: DocumentType,
  settings: AppSettings,
  options: { client?: Entity | null; productsById?: Record<string, { tax_id?: string | null } | undefined> } = {},
): { taxId: string | null; label: string; rate: number }[] {
  return items.map((it) => {
    const product =
      it.product_id && options.productsById ? options.productsById[it.product_id] : undefined;
    const taxId = resolveLineTaxId(it, type, settings, {
      product,
      client: options.client,
    });
    const rate = findRate(settings, taxId);
    if (!rate) return { taxId: null, label: '', rate: 0 };
    if (rate.type !== 'combined' && isExempt(options.client, rate.id)) {
      return { taxId, label: '—', rate: 0 };
    }
    return {
      taxId,
      label: `${rate.name} (${Number(rate.rate) || 0}%)`,
      rate: Number(rate.rate) || 0,
    };
  });
}

/** Effective VAT rate (decimal) used for `type` given current settings. */
export function effectiveTaxRate(settings: AppSettings, type: DocumentType): number {
  return selectedTaxRate(settings, type);
}

/** Effective fiscal stamp amount for `type` given current settings. */
export function effectiveFiscalStamp(settings: AppSettings, type: DocumentType): number {
  return selectedFiscalStamp(settings, type);
}
