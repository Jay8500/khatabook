export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Phase 1 placeholder response; each function is implemented in Phase 2. */
export function notImplemented(name: string): Response {
  return Response.json(
    { error: "not_implemented", function: name },
    { status: 501, headers: corsHeaders },
  );
}
