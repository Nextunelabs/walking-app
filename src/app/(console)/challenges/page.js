import { ChallengesList } from "@/components/ChallengeScreens.js";
import { requireAdminPage } from "@/lib/guards.js";

export const dynamic = "force-dynamic";

export default async function ChallengesPage() {
  await requireAdminPage();
  return <ChallengesList />;
}
