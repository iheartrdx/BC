import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env, configured } from "./env";

// Stable placeholders that let the app boot without Supabase configured.
// Any real call will be guarded by `configured.supabase` upstream.
const url = env.supabaseUrl ?? "https://placeholder.supabase.co";
const anon = env.supabaseAnonKey ?? "placeholder-anon-key";

export function browserSupabase() {
  return createBrowserClient(url, anon);
}

export function serverSupabase() {
  const store = cookies();
  return createServerClient(url, anon, {
    cookies: {
      get: (n) => store.get(n)?.value,
      set: () => {},
      remove: () => {},
    },
  });
}

// Server-only admin client (bypasses RLS). Never expose to the browser.
export function adminSupabase() {
  if (!configured.supabaseAdmin) {
    throw new Error(
      "Supabase service-role key not configured. Set SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return createClient(env.supabaseUrl!, env.supabaseServiceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
