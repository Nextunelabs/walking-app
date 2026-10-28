import { requireApiAdmin, requireApiUser } from "@/lib/guards.js";
import { assertSameOrigin, jsonOk, readJson, toErrorResponse, zodError } from "@/lib/http.js";
import { challengeWriteSchema, createChallenge, listChallenges } from "@/lib/repos/challenges.js";

export async function GET(request) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { searchParams } = new URL(request.url);
    const data = await listChallenges({
      search: searchParams.get("search") || "",
      status: searchParams.get("status") || "",
      page: searchParams.get("page") || 1,
      limit: searchParams.get("limit") || 20,
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
    const auth = await requireApiAdmin();
    if (!auth.ok) return auth.response;
    const parsed = challengeWriteSchema.safeParse(await readJson(request));
    if (!parsed.success) return zodError(parsed.error);
    const challenge = await createChallenge(parsed.data, auth.user.userId);
    return jsonOk({ challenge }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
