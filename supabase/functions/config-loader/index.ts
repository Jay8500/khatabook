// Returns app_settings visible to the caller's role.
import "@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, notImplemented } from "../_shared/cors.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return notImplemented("config-loader");
});
