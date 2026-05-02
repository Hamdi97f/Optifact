import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format a number as Tunisian Dinar with 3 decimals (millimes). */
export function formatTND(value: number): string {
  if (!Number.isFinite(value)) return '0.000 TND';
  return `${value.toLocaleString('fr-TN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} TND`;
}

export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR');
}

/** Round to 3 decimals (millimes) — Tunisian currency precision. */
export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
