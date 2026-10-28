export const SESSION_COOKIE_NAME = "walking_session";

export function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET must be set (min 16 characters)");
  }
  return new TextEncoder().encode(secret);
}

export function getSessionMaxAgeSeconds() {
  const raw = process.env.SESSION_MAX_AGE_SECONDS;
  const n = raw ? parseInt(raw, 10) : 43200;
  return Number.isFinite(n) && n > 0 ? n : 43200;
}
