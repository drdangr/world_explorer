import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL и SUPABASE_ANON_KEY не заданы. Укажите их в .env.local, чтобы использовать Supabase.",
    );
  }

  cachedClient = createClient(url, key, {
    auth: {
      persistSession: false,
    },
  });

  return cachedClient;
}

export function isSupabaseEnabled(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

