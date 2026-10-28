import { requireApiAdmin, requireApiUser } from "@/lib/guards.js";
import { assertSameOrigin, jsonError, jsonOk, readJson, toErrorResponse, zodError } from "@/lib/http.js";
import {
  challengeWriteSchema,
  deleteChallenge,
  getChallenge,
  updateChallenge,
} from "@/lib/repos/challenges.js";

export async function GET(_request, { params }) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const challenge = await getChallenge(id, { includeRoute: true });
    if (!challenge) return jsonError("Challenge not found", 404);
    return jsonOk({ challenge });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    const blocked = assertSameOrigin(request);
    if (blocked) return blocked;
    const auth = await requireApiAdmin();
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const parsed = challengeWriteSchema.safeParse(await readJson(request));
    if (!parsed.success) return zodError(parsed.error);
    const challenge = await updateChallenge(id, parsed.data);
    return jsonOk({ challenge });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const blocked = assertSameOrigin(request);
    if (blocked) return blocked;
    const auth = await requireApiAdmin();
    if (!auth.ok) return auth.response;
    const { id } = await params;
    await deleteChallenge(id);
    return jsonOk({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
