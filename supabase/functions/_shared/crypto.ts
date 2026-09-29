// AES-GCM, matching src/app/core/services/encryption.service.ts.
export interface Envelope {
  iv: string;
  data: string;
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

let cached: Promise<CryptoKey> | undefined;

function key(): Promise<CryptoKey> {
  const raw = Deno.env.get("ENCRYPTION_KEY");
  if (!raw) throw new Error("ENCRYPTION_KEY secret is not set");
  cached ??= crypto.subtle.importKey("raw", fromBase64(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
  return cached;
}

export async function encrypt(payload: unknown): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), plain);
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(cipher)) };
}

export async function decrypt<T>(envelope: Envelope): Promise<T> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(envelope.iv) },
    await key(),
    fromBase64(envelope.data),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}
