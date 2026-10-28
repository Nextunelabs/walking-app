import { requireApiUser } from "@/lib/guards.js";
import { jsonOk, toErrorResponse } from "@/lib/http.js";
import { walkingHome } from "@/lib/repos/home.js";

export async function GET() {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    return jsonOk(await walkingHome(auth.user.userId));
  } catch (error) {
    return toErrorResponse(error);
  }
}
