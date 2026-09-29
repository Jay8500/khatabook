// Returns app_settings the caller may see: public for everyone, authenticated for
// signed-in users, admin for users whose role has can_manage_settings. Signed-in users
// also receive ENCRYPTION_KEY (from the function secret) for encrypt-rpc.
import "@supabase/functions-js/edge-runtime.d.ts";
import { json, preflight } from "../_shared/cors.ts";
import { adminClient, requestUser } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  try {
    const caller = await requestUser(req);
    const visible = new Set(["public"]);

    if (caller) {
      visible.add("authenticated");
      const { data } = await adminClient
        .from("users_profile")
        .select("roles(permissions)")
        .eq("id", caller.user.id)
        .maybeSingle();
      const role = data?.roles as { permissions?: Record<string, boolean> } | null;
      if (role?.permissions?.can_manage_settings) visible.add("admin");
    }

    const { data: rows, error } = await adminClient.from("app_settings").select("key, value, visibility");
    if (error) throw error;

    const settings: Record<string, unknown> = {};
    for (const row of rows ?? []) {
      if (visible.has(row.visibility)) settings[row.key] = row.value;
    }
    if (caller) settings.ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY");

    return json(settings);
  } catch (err) {
    console.error("config-loader", err);
    return json({ error: "config_unavailable" }, 500);
  }
});
