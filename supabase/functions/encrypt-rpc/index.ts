// Decrypts the client payload, runs the named RPC server side, returns an encrypted response.
import "@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, notImplemented } from "../_shared/cors.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return notImplemented("encrypt-rpc");
});
