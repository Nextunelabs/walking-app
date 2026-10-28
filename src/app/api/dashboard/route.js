import { requireApiUser } from "@/lib/guards.js";
import { jsonOk, toErrorResponse } from "@/lib/http.js";
import { dashboardCounts, leaderboard, listSessions } from "@/lib/repos/sessions.js";
import { walkingHome } from "@/lib/repos/home.js";

export async function GET() {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    if (auth.user.role === "admin") {
      const [counts, recent, ranks] = await Promise.all([
        dashboardCounts(),
        listSessions({ limit: 5 }),
        leaderboard(),
      ]);
      return jsonOk({ role: "admin", counts, recentSessions: recent.data, leaderboard: ranks.slice(0, 5) });
    }
    const home = await walkingHome(auth.user.userId);
    return jsonOk({ role: "user", ...home });
  } catch (error) {
    return toErrorResponse(error);
  }
}
