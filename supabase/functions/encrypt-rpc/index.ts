// Decrypts { rpc, params } from the client, runs the RPC as the calling user (so RLS
// applies), and returns the encrypted { data } or { error }.
import "@supabase/functions-js/edge-runtime.d.ts";
import { json, preflight } from "../_shared/cors.ts";
import { decrypt, encrypt, type Envelope } from "../_shared/crypto.ts";
import { requestUser, userClient } from "../_shared/supabase.ts";

const RPC_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  const caller = await requestUser(req);
  if (!caller) return json({ error: "unauthorized" }, 401);

  let request: { rpc: string; params?: Record<string, unknown> };
  try {
    request = await decrypt(await req.json() as Envelope);
  } catch {
    return json({ error: "bad_payload" }, 400);
  }
  if (!RPC_NAME.test(request.rpc ?? "")) return json({ error: "bad_rpc" }, 400);

  const { data, error } = await userClient(caller.token).rpc(request.rpc, request.params ?? {});
  const body = error
    ? { error: { message: error.message, code: error.code, details: error.details, hint: error.hint } }
    : { data };
  return json(await encrypt(body));
});
