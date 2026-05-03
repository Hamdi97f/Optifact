/**
 * Document numbering allocator.
 *
 * Given an `AppSettings` and the document type & date, returns the next
 * formatted number (e.g. "FAC-2026-00042") and the updated `AppSettings`
 * with the counter advanced. The caller is expected to persist the new
 * settings via `saveSettings()` after the document has been saved.
 *
 * Reset cycles supported:
 *   - `never`   → counter is global, `period_key` is unused.
 *   - `yearly`  → counter resets when the document's YYYY changes.
 *   - `monthly` → counter resets when the document's YYYY-MM changes.
 *
 * The period bucket used is derived from the document's date (not the
 * current wall-clock), so back-dated documents stay in the right sequence.
 */

import type {
  AppSettings,
  NumberedDocType,
  NumberingSequence,
} from '@/types/settings';

export interface AllocatedNumber {
  number: string;
  /** Updated settings, with `numbering[type]` advanced by one. */
  settings: AppSettings;
}

function periodKeyFor(seq: NumberingSequence, date: Date): string {
  if (seq.reset_cycle === 'never') return '';
  const y = date.getFullYear();
  if (seq.reset_cycle === 'yearly') return String(y);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function pad(value: number, width: number): string {
  const s = String(value);
  return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}

function periodSegment(seq: NumberingSequence, period: string): string {
  // The period is embedded between the prefix and the counter so that
  // resetting reads naturally: "FAC-2026-00001" rather than "FAC-00001".
  if (seq.reset_cycle === 'never' || !period) return '';
  return `${period}-`;
}

/** Compute (without advancing) what the next number for `type` would be. */
export function previewNumber(settings: AppSettings, type: NumberedDocType, date: Date): string {
  const seq = settings.numbering[type];
  const period = periodKeyFor(seq, date);
  const counter = period === seq.period_key ? seq.next_number : 1;
  return `${seq.prefix}${periodSegment(seq, period)}${pad(counter, seq.padding)}${seq.suffix}`;
}

/** Allocate the next number and return the advanced settings. */
export function allocateNumber(
  settings: AppSettings,
  type: NumberedDocType,
  date: Date,
): AllocatedNumber {
  const seq = settings.numbering[type];
  const period = periodKeyFor(seq, date);
  const counter = period === seq.period_key ? seq.next_number : 1;
  const formatted = `${seq.prefix}${periodSegment(seq, period)}${pad(counter, seq.padding)}${seq.suffix}`;

  const advanced: NumberingSequence = {
    ...seq,
    next_number: counter + 1,
    period_key: period,
  };
  const nextSettings: AppSettings = {
    ...settings,
    numbering: { ...settings.numbering, [type]: advanced },
  };
  return { number: formatted, settings: nextSettings };
}
