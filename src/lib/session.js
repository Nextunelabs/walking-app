import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  getSessionMaxAgeSeconds,
  getSessionSecret,
} from "./session-config.js";

export async function createSessionToken(user) {
  const maxAge = getSessionMaxAgeSeconds();
  const token = await new SignJWT({
    sub: user.userId,
    email: user.email,
    name: user.fullName ?? "",
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(getSessionSecret());
  return { token, maxAge };
}

export async function verifySessionToken(token) {
  const { payload } = await jwtVerify(token, getSessionSecret());
  if (typeof payload.sub !== "string") return null;
  return {
    userId: payload.sub,
    email: typeof payload.email === "string" ? payload.email : "",
    fullName: typeof payload.name === "string" ? payload.name : "",
    role: payload.role === "admin" ? "admin" : "user",
  };
}

export async function getSessionFromCookies() {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    return await verifySessionToken(raw);
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAge) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export { SESSION_COOKIE_NAME };
