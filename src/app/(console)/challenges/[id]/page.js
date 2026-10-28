import { ChallengeDetail } from "@/components/ChallengeScreens.js";
import { requireAdminPage } from "@/lib/guards.js";

export const dynamic = "force-dynamic";

export default async function ChallengePage({ params }) {
  await requireAdminPage();
  const { id } = await params;
  return <ChallengeDetail challengeId={id} />;
}
