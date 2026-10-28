import { requireApiAdmin } from "@/lib/guards.js";
import { jsonOk, toErrorResponse } from "@/lib/http.js";
import { listParticipants } from "@/lib/repos/participants.js";

export async function GET(request) {
  try {
    const auth = await requireApiAdmin();
    if (!auth.ok) return auth.response;
    const { searchParams } = new URL(request.url);
    const data = await listParticipants({
      challengeId: searchParams.get("challengeId") || "",
      search: searchParams.get("search") || "",
      status: searchParams.get("status") || "",
      page: searchParams.get("page") || 1,
    });
    return jsonOk(data);
  } catch (error) {
    return toErrorResponse(error);
  }
}
