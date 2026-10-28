import { ActivityDetail } from "@/components/AdminLists.js";
import { requireAdminPage } from "@/lib/guards.js";

export const dynamic = "force-dynamic";

export default async function ActivityDetailPage({ params }) {
  await requireAdminPage();
  const { sessionId } = await params;
  return <ActivityDetail sessionId={sessionId} />;
}
