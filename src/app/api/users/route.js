import { requireApiAdmin } from "@/lib/guards.js";
import { assertSameOrigin, jsonOk, readJson, toErrorResponse, zodError } from "@/lib/http.js";
import { createUser, listUsers, userWriteSchema } from "@/lib/repos/users.js";

export async function GET(request) {
  try {
    const auth = await requireApiAdmin();
    if (!auth.ok) return auth.response;
    const { searchParams } = new URL(request.url);
    const data = await listUsers({
      search: searchParams.get("search") || "",
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
    const auth = await requireApiAdmin();
    if (!auth.ok) return auth.response;
    const body = await readJson(request);
    const parsed = userWriteSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    const user = await createUser(parsed.data);
    return jsonOk({ user }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
