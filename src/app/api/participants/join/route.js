import { requireApiUser } from "@/lib/guards.js";
import { assertSameOrigin, jsonError, jsonOk, readJson, toErrorResponse } from "@/lib/http.js";
import { joinChallenge } from "@/lib/repos/participants.js";

export async function POST(request) {
  try {
    const blocked = assertSameOrigin(request);
    if (blocked) return blocked;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const body = await readJson(request);
    const challengeId = typeof body.challengeId === "string" ? body.challengeId : "";
    if (!challengeId) return jsonError("Choose a challenge");
    const participant = await joinChallenge(auth.user.userId, challengeId);
    return jsonOk({ participant }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
