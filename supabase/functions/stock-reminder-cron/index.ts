// Daily cron: finds stocks at or below their threshold and creates reminders.
import "@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, notImplemented } from "../_shared/cors.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return notImplemented("stock-reminder-cron");
});
