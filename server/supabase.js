import { createClient } from "@supabase/supabase-js";

let client;

export function getSupabaseAdmin() {
  if (client) {
    return client;
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  client = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return client;
}

export async function expectData(queryPromise) {
  const { data, error, count } = await queryPromise;

  if (error) {
    throw new Error(error.message);
  }

  return { data, count };
}
