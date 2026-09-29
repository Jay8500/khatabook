/** Downscale rules from app_settings (BILL_IMAGE, AVATAR_IMAGE). */
export interface ImageRules {
  max_px?: number;
  quality?: number;
}

/** Resizes to fit max_px and re-encodes as JPEG, so uploads stay small. */
export async function compressImage(file: File, rules: ImageRules = {}): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = rules.max_px ? Math.min(1, rules.max_px / Math.max(bitmap.width, bitmap.height)) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))), 'image/jpeg', rules.quality),
  );
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
