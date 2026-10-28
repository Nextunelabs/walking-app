import { NextResponse } from "next/server";
import { HttpError } from "./errors.js";

export { HttpError };

export function jsonError(message, status = 400, extra) {
  return NextResponse.json({ error: message, ...(extra || {}) }, { status });
}

export function jsonOk(data, status = 200) {
  return NextResponse.json(data, { status });
}

export function toErrorResponse(error) {
  if (error instanceof HttpError) return jsonError(error.message, error.status);
  if (error?.code === "22P02") return jsonError("Record not found", 404);
  if (error?.code === "23505") return jsonError("This record already exists", 409);
  if (error?.code === "23503") return jsonError("This record is still in use", 409);
  const message = String(error?.message || "");
  if (
    message.includes("DATABASE_URL") ||
    message.includes("connect") ||
    ["ECONNREFUSED", "ENOTFOUND", "28P01", "3D000", "57P01", "08006", "53300"].includes(error?.code)
  ) {
    console.error("Database connection failed");
    return jsonError("Database connection failed", 503);
  }
  console.error(error);
  return jsonError("Something went wrong", 500);
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

const hits = new Map();

export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const current = hits.get(key);
  if (!current || current.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  current.count += 1;
  if (current.count > limit) {
    return jsonError("Too many requests. Please wait and try again.", 429);
  }
  return null;
}

export function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "local";
}

export function assertSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    return jsonError("Cross-origin request blocked", 403);
  }
  if (!host || originHost !== host) {
    return jsonError("Cross-origin request blocked", 403);
  }
  return null;
}

export function zodError(error) {
  const details = (error.issues || []).map((issue) => issue.message).filter(Boolean);
  return jsonError(details[0] || "Invalid input", 400, { details });
}
