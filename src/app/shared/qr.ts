/** QR code as a PNG data URL. `qrcode` is CommonJS: its functions may sit under `default`. */
export async function qrDataUrl(text: string, width: number): Promise<string> {
  const mod = (await import('qrcode')) as unknown as {
    toDataURL?: typeof import('qrcode').toDataURL;
    default?: { toDataURL: typeof import('qrcode').toDataURL };
  };
  const toDataURL = mod.toDataURL ?? mod.default!.toDataURL;
  return toDataURL(text, { margin: 1, width });
}
