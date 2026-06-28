/** Decode text from a data: URL (browser-safe). */
export function decodeDataUrlText(dataUrl: string): string | null {
  const trimmed = dataUrl.trim();
  const commaIndex = trimmed.indexOf(",");
  if (commaIndex < 0) return null;

  const meta = trimmed.slice(0, commaIndex);
  const payload = trimmed.slice(commaIndex + 1);

  try {
    if (meta.includes(";base64")) {
      return atob(payload);
    }
    return decodeURIComponent(payload);
  } catch {
    return null;
  }
}
