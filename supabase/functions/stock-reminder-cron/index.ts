// Daily job (pg_cron, schedule from app_settings STOCK_REMINDER_CRON). Creates a reminder
// for every stock at or below its threshold; texts come from REMINDER_MESSAGES.
import "@supabase/functions-js/edge-runtime.d.ts";
import { json, preflight } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return json({ error: "unauthorized" }, 401);
  }

  const { data, error } = await adminClient.rpc("generate_stock_reminders");
  if (error) {
    console.error("stock-reminder-cron", error);
    return json({ error: error.message }, 500);
  }
  return json({ created: data });
});
