import { requireApiUser } from "@/lib/guards.js";
import { assertSameOrigin, jsonOk, readJson, toErrorResponse } from "@/lib/http.js";
import { addTrackingPoints, getRoute } from "@/lib/repos/sessions.js";

export async function GET(_request, { params }) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await params;
    return jsonOk(await getRoute(id, auth.user));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request, { params }) {
  try {
    const blocked = assertSameOrigin(request);
    if (blocked) return blocked;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const body = await readJson(request);
    const result = await addTrackingPoints(id, auth.user, body.points);
    return jsonOk(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
