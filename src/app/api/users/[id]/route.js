import { requireApiAdmin } from "@/lib/guards.js";
import { assertSameOrigin, jsonError, jsonOk, readJson, toErrorResponse, zodError } from "@/lib/http.js";
import { deleteUser, findUserById, updateUser, userWriteSchema } from "@/lib/repos/users.js";

export async function GET(_request, { params }) {
  try {
    const auth = await requireApiAdmin();
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const user = await findUserById(id);
    if (!user) return jsonError("User not found", 404);
    return jsonOk({ user });
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
    const body = await readJson(request);
    const parsed = userWriteSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    const user = await updateUser(id, parsed.data, auth.user);
    return jsonOk({ user });
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
    await deleteUser(id, auth.user);
    return jsonOk({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
