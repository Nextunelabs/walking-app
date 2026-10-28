import { LeaderboardScreen } from "@/components/AdminLists.js";
import { requireAdminPage } from "@/lib/guards.js";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  await requireAdminPage();
  return <LeaderboardScreen />;
}
