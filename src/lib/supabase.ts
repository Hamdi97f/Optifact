import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Surfaces a clear, actionable message in dev instead of an opaque runtime crash.
  // eslint-disable-next-line no-console
  console.warn(
    '[Optifact] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy `.env.example` to `.env` and fill them in.',
  );
}

export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'public-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export const isSupabaseConfigured = Boolean(url && anonKey);
