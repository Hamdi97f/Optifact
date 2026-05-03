/**
 * SettingsProvider — single source of truth for all app-wide configuration
 * (company info, locale, currency, numbering, taxes, branding, …).
 *
 * - Settings are loaded from the file-backed db once per signed-in user and
 *   cached in memory.
 * - Branding (primary colour) and direction (RTL for Arabic) are applied to
 *   `<html>` whenever they change.
 * - Consumers update settings via `update(patch)`; persistence happens
 *   asynchronously and the in-memory state is rolled back on failure.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { defaultSettings, loadSettings, saveSettings } from '@/lib/settingsRepo';
import { useAuth } from '@/hooks/useAuth';
import type { AppSettings } from '@/types/settings';

interface SettingsContextValue {
  settings: AppSettings;
  loading: boolean;
  /** Replace the entire settings object. */
  setSettings: (next: AppSettings) => Promise<void>;
  /** Shallow-merge a top-level patch (e.g. `{ company: nextCompany }`). */
  update: (patch: Partial<AppSettings>) => Promise<void>;
  /** Force a re-load from storage (e.g. after import). */
  reload: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

/** Convert a "#rrggbb" colour to the "H S% L%" triplet our CSS vars expect. */
function hexToHslTriplet(hex: string): string | null {
  const match = /^#?([a-f0-9]{6}|[a-f0-9]{3})$/i.exec(hex.trim());
  if (!match) return null;
  let h = match[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0;
  let hue = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        hue = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        hue = (b - r) / d + 2;
        break;
      default:
        hue = (r - g) / d + 4;
    }
    hue *= 60;
  }
  return `${Math.round(hue)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function applyBranding(settings: AppSettings): void {
  if (typeof document === 'undefined') return;
  const triplet = hexToHslTriplet(settings.branding.primary_color);
  if (triplet) {
    document.documentElement.style.setProperty('--primary', triplet);
    document.documentElement.style.setProperty('--ring', triplet);
  }
  document.documentElement.dir = settings.localization.rtl ? 'rtl' : 'ltr';
  document.documentElement.lang = settings.localization.language;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setLocal] = useState<AppSettings>(() => defaultSettings());
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!user) {
      setLocal(defaultSettings());
      return;
    }
    setLoading(true);
    try {
      const next = await loadSettings();
      setLocal(next);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    applyBranding(settings);
  }, [settings]);

  const setSettings = useCallback(async (next: AppSettings) => {
    const previous = settings;
    setLocal(next);
    try {
      await saveSettings(next);
    } catch (e) {
      // Roll back on persistence failure so the UI keeps showing what is
      // actually stored on the server.
      setLocal(previous);
      throw e;
    }
  }, [settings]);

  const update = useCallback(
    (patch: Partial<AppSettings>) => setSettings({ ...settings, ...patch }),
    [setSettings, settings],
  );

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, loading, setSettings, update, reload }),
    [settings, loading, setSettings, update, reload],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a <SettingsProvider>');
  return ctx;
}
