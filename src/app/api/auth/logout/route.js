import { jsonOk } from "@/lib/http.js";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/session.js";

export async function POST() {
  const response = jsonOk({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", sessionCookieOptions(0));
  return response;
}
