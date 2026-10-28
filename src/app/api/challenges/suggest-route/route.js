import { requireApiAdmin } from "@/lib/guards.js";
import { assertSameOrigin, jsonOk, readJson, toErrorResponse } from "@/lib/http.js";
import { suggestRoute } from "@/lib/repos/challenges.js";

export async function POST(request) {
  try {
    const blocked = assertSameOrigin(request);
    if (blocked) return blocked;
    const auth = await requireApiAdmin();
    if (!auth.ok) return auth.response;
    const body = await readJson(request);
    const suggestion = await suggestRoute(body.fromDistrict, body.toDistrict);
    return jsonOk(suggestion);
  } catch (error) {
    return toErrorResponse(error);
  }
}
