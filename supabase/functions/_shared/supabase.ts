import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** Bypasses RLS. Only for server-side work that has already checked the caller. */
export const adminClient: SupabaseClient = createClient(url, serviceKey, noSession);

/** Acts as the calling user, so row level security applies. */
export function userClient(token: string): SupabaseClient {
  return createClient(url, anonKey, {
    ...noSession,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export function bearer(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

/** The signed-in user for this request, or null (anonymous or publishable key only). */
export async function requestUser(req: Request): Promise<{ user: User; token: string } | null> {
  const token = bearer(req);
  if (!token || !token.includes(".")) return null;
  const { data, error } = await adminClient.auth.getUser(token);
  return error || !data.user ? null : { user: data.user, token };
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const { data } = await adminClient.from("app_settings").select("value").eq("key", key).maybeSingle();
  return data?.value as T | undefined;
}
