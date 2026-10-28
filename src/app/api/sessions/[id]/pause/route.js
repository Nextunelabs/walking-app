import { requireApiUser } from "@/lib/guards.js";
import { assertSameOrigin, jsonOk, toErrorResponse } from "@/lib/http.js";
import { setSessionStatus } from "@/lib/repos/sessions.js";

async function change(request, params, status) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  return jsonOk(await setSessionStatus(id, auth.user, status));
}

export async function POST(request, { params }) {
  try {
    return await change(request, params, "paused");
  } catch (error) {
    return toErrorResponse(error);
  }
}
