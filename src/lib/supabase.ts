/**
 * Backwards-compatible façade so existing call sites that import
 *   `import { supabase } from '@/lib/supabase'`
 * continue to work after the migration to the api-gateway backend.
 *
 * `supabase.from(...)` is now a JSON-blob "table" backed by the gateway's
 * file-storage endpoints (see ./db.ts and ./apiClient.ts).
 */

import { db } from './db';
import { isApiConfigured } from './apiClient';

export const supabase = db;
export { isApiConfigured };

// Kept for the existing Login.tsx warning banner; meaning is the same now
// (i.e. "is the backend configured at all?").
export const isSupabaseConfigured = isApiConfigured;
