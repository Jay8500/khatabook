// Accepts a bill photo, extracts items (OCR placeholder), stores scanned_data.
import "@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, notImplemented } from "../_shared/cors.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return notImplemented("vendor-scan");
});
