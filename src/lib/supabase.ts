import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase Client Configuration
 * Credentials are read exclusively from environment variables:
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_PUBLISHABLE_KEY
 * Never hardcode keys in client-side source code.
 */

export const getSupabaseUrl = (): string => {
  return (
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
    (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) ||
    ''
  );
};

export const getSupabasePublishableKey = (): string => {
  return (
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    ''
  );
};

export const isSupabaseConfigured = (): boolean => {
  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();
  return Boolean(url && key);
};

let cachedClient: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient => {
  if (cachedClient) return cachedClient;

  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();

  cachedClient = createClient(
    url || 'https://placeholder.supabase.co',
    key || 'placeholder-anon-key',
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );
  return cachedClient;
};

// Shared Supabase client proxy that resolves lazily
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseClient();
    const val = (client as any)[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  },
});
