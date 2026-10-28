import { requireApiUser } from "@/lib/guards.js";
import { jsonOk, toErrorResponse } from "@/lib/http.js";

export async function GET() {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    return jsonOk({ user: auth.user });
  } catch (error) {
    return toErrorResponse(error);
  }
}
