import { authenticate } from "@/lib/repos/users.js";
import { clientIp, jsonError, jsonOk, rateLimit, readJson, toErrorResponse } from "@/lib/http.js";
import { createSessionToken, SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/session.js";

export async function POST(request) {
  try {
    const limited = rateLimit(`login:${clientIp(request)}`, 8, 10 * 60 * 1000);
    if (limited) return limited;
    const body = await readJson(request);
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) return jsonError("Email and password are required");

    const result = await authenticate(email, password);
    if (!result.ok) {
      const message =
        result.reason === "inactive"
          ? "This account is inactive. Contact an administrator."
          : "Invalid email or password";
      return jsonError(message, 401);
    }

    const { token, maxAge } = await createSessionToken(result.user);
    const response = jsonOk({ ok: true, role: result.user.role });
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(maxAge));
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
