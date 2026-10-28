import { requireApiUser } from "@/lib/guards.js";
import { jsonError, jsonOk, toErrorResponse } from "@/lib/http.js";
import { leaderboard } from "@/lib/repos/sessions.js";
import { listChallenges } from "@/lib/repos/challenges.js";

export async function GET(request) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    if (auth.user.role !== "admin") {
      return jsonError("Administrator access required", 403);
    }
    const { searchParams } = new URL(request.url);
    const challengeId = searchParams.get("challengeId") || "";
    const [rows, challenges] = await Promise.all([
      leaderboard(challengeId),
      listChallenges({ limit: 100 }),
    ]);
    return jsonOk({ rows, challenges: challenges.data });
  } catch (error) {
    return toErrorResponse(error);
  }
}
