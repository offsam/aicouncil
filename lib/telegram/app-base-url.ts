/** Absolute app origin for server-side internal API calls (Vercel / explicit URL / local dev). */
export function resolveAppBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  const port = process.env.PORT?.trim() || "3002";
  return `http://127.0.0.1:${port}`;
}
