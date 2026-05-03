/**
 * Settings-aware formatters used everywhere in the app (lists, totals, PDFs).
 *
 * The legacy helpers in `./utils.ts` (`formatTND`, `formatDate`) are kept for
 * backwards compatibility, but every new call site should use these helpers
 * with the active `AppSettings` so that user preferences (currency, locale,
 * decimal places, date format, etc.) take effect.
 */

import type { AppSettings } from '@/types/settings';

const LANG_TO_LOCALE: Record<string, string> = {
  fr: 'fr-FR',
  en: 'en-US',
  ar: 'ar-TN',
};

export function localeFor(settings: AppSettings): string {
  return LANG_TO_LOCALE[settings.localization.language] ?? 'fr-FR';
}

/* --------------------------------- numbers -------------------------------- */

export function formatNumber(
  value: number,
  settings: AppSettings,
  opts: { minDecimals?: number; maxDecimals?: number } = {},
): string {
  const { localization } = settings;
  const min = opts.minDecimals ?? localization.amount_decimals;
  const max = opts.maxDecimals ?? min;
  if (!Number.isFinite(value)) value = 0;

  const fixed = value.toFixed(max);
  const [intPartRaw, fracPartRaw = ''] = fixed.split('.');
  const negative = intPartRaw.startsWith('-');
  const intDigits = negative ? intPartRaw.slice(1) : intPartRaw;
  const grouped = groupDigits(intDigits, localization.thousands_separator);

  let frac = fracPartRaw;
  if (frac.length > max) frac = frac.slice(0, max);
  // Trim any trailing zeros below `min` decimals.
  while (frac.length > min && frac.endsWith('0')) frac = frac.slice(0, -1);

  const out =
    frac.length > 0 ? `${grouped}${localization.decimal_separator}${frac}` : grouped;
  return negative ? `-${out}` : out;
}

function groupDigits(digits: string, sep: string): string {
  if (!sep) return digits;
  // Group by 3 from the right.
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

export function formatMoney(value: number, settings: AppSettings): string {
  const formatted = formatNumber(value, settings, {
    minDecimals: settings.localization.amount_decimals,
    maxDecimals: settings.localization.amount_decimals,
  });
  const sym = settings.currency.symbol || settings.currency.code;
  return settings.currency.symbol_position === 'prefix'
    ? `${sym} ${formatted}`
    : `${formatted} ${sym}`;
}

export function formatQuantity(value: number, settings: AppSettings): string {
  return formatNumber(value, settings, {
    minDecimals: 0,
    maxDecimals: settings.localization.quantity_decimals,
  });
}

export function formatUnitPrice(value: number, settings: AppSettings): string {
  return formatMoney(roundTo(value, settings.localization.unit_price_decimals), settings);
}

export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/* --------------------------------- dates ---------------------------------- */

export function formatDate(value: string | Date, settings: AppSettings): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  switch (settings.localization.date_format) {
    case 'MM/DD/YYYY':
      return `${mm}/${dd}/${yyyy}`;
    case 'YYYY-MM-DD':
      return `${yyyy}-${mm}-${dd}`;
    case 'DD/MM/YYYY':
    default:
      return `${dd}/${mm}/${yyyy}`;
  }
}
