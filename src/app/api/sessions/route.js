import { requireApiUser } from "@/lib/guards.js";
import { assertSameOrigin, jsonError, jsonOk, readJson, toErrorResponse } from "@/lib/http.js";
import { listSessions, startOrResumeSession } from "@/lib/repos/sessions.js";

export async function GET(request) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { searchParams } = new URL(request.url);
    const requestedUser = searchParams.get("userId") || "";
    const mine = searchParams.get("mine") === "1" || auth.user.role !== "admin";
    if (!mine && auth.user.role !== "admin") {
      return jsonError("You can only view your own walking sessions", 403);
    }
    if (requestedUser && mine && requestedUser !== auth.user.userId && auth.user.role !== "admin") {
      return jsonError("You can only view your own walking sessions", 403);
    }
    const data = await listSessions({
      challengeId: searchParams.get("challengeId") || "",
      userId: mine ? auth.user.userId : requestedUser,
      status: searchParams.get("status") || "",
      openOnly: searchParams.get("open") === "1",
      page: searchParams.get("page") || 1,
    });
    return jsonOk(data);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request) {
  try {
    const blocked = assertSameOrigin(request);
    if (blocked) return blocked;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const body = await readJson(request);
    const challengeId = typeof body.challengeId === "string" ? body.challengeId : "";
    if (!challengeId) return jsonError("Choose a challenge");
    const session = await startOrResumeSession(auth.user.userId, challengeId);
    return jsonOk({ session }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
