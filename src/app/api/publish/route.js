import { requireApiAdmin } from "@/lib/guards.js";
import { assertSameOrigin, jsonOk, readJson, toErrorResponse, zodError } from "@/lib/http.js";
import { HttpError } from "@/lib/errors.js";
import { publishProject, publishReadiness, publishSchema } from "@/lib/publish.js";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

export async function GET() {
  try {
    const auth = await requireApiAdmin();
    if (!auth.ok) return auth.response;
    return jsonOk(publishReadiness());
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  let input;
  try {
    const body = await readJson(request);
    const parsed = publishSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    input = parsed.data;
  } catch (error) {
    return toErrorResponse(error);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        await publishProject(input, send);
      } catch (error) {
        const message = error instanceof HttpError ? error.message : "Publishing failed.";
        send({ error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
