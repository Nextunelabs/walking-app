import { requireApiAdmin } from "@/lib/guards.js";
import { assertSameOrigin, jsonOk, readJson, toErrorResponse, zodError } from "@/lib/http.js";
import { passwordSchema, resetPassword } from "@/lib/repos/users.js";

export async function POST(request, { params }) {
  try {
    const blocked = assertSameOrigin(request);
    if (blocked) return blocked;
    const auth = await requireApiAdmin();
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const body = await readJson(request);
    const parsed = passwordSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    await resetPassword(id, parsed.data.password);
    return jsonOk({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
