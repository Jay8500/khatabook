// Supabase Auth "Send SMS" hook. The provider is admin-driven via app_settings:
//   SMS_PROVIDER = { "provider": "log" }  -> the OTP is written to this function's logs (testing)
//   SMS_PROVIDER = { "provider": "http", "url": ..., "method": "POST",
//                    "headers": { ... }, "body": { ... } }
// url/headers/body may use {{phone}}, {{otp}}, {{message}} and {{env:NAME}} (a function
// secret such as the provider API key). OTP_SMS_TEMPLATE builds {{message}}.
import "@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "npm:standardwebhooks@1.0.0";
import { getSetting } from "../_shared/supabase.ts";

interface Provider {
  provider: "log" | "http";
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

function fill(template: unknown, vars: Record<string, string>): unknown {
  if (typeof template === "string") {
    return template.replace(/\{\{\s*(env:)?([A-Za-z0-9_]+)\s*\}\}/g, (_, env, name) =>
      env ? Deno.env.get(name) ?? "" : vars[name] ?? ""
    );
  }
  if (Array.isArray(template)) return template.map((t) => fill(t, vars));
  if (template && typeof template === "object") {
    return Object.fromEntries(Object.entries(template).map(([k, v]) => [k, fill(v, vars)]));
  }
  return template;
}

const failure = (status: number, message: string) =>
  Response.json({ error: { http_code: status, message } }, { status });

Deno.serve(async (req) => {
  const payload = await req.text();
  const secret = (Deno.env.get("SEND_SMS_HOOK_SECRET") ?? "").replace("v1,whsec_", "");

  let event: { user: { phone: string }; sms: { otp: string } };
  try {
    event = new Webhook(secret).verify(payload, Object.fromEntries(req.headers)) as typeof event;
  } catch {
    return failure(401, "invalid signature");
  }

  const phone = event.user.phone;
  const otp = event.sms.otp;
  const template = (await getSetting<string>("OTP_SMS_TEMPLATE")) ?? "{otp}";
  const message = template.replace("{otp}", otp);
  const provider = await getSetting<Provider>("SMS_PROVIDER");

  if (!provider || provider.provider === "log") {
    console.log(`[send-sms] ${phone}: ${message}`);
    return Response.json({});
  }

  if (provider.provider === "http" && provider.url) {
    const vars = { phone, otp, message };
    const headers = fill(provider.headers ?? {}, vars) as Record<string, string>;
    const res = await fetch(fill(provider.url, vars) as string, {
      method: provider.method ?? "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: provider.body === undefined ? undefined : JSON.stringify(fill(provider.body, vars)),
    });
    if (!res.ok) {
      console.error("[send-sms] provider error", res.status, await res.text());
      return failure(500, "sms provider rejected the request");
    }
    return Response.json({});
  }

  return failure(500, "SMS_PROVIDER is not configured");
});
