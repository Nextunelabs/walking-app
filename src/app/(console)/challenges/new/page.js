import { ChallengeForm } from "@/components/ChallengeScreens.js";
import { requireAdminPage } from "@/lib/guards.js";

export const dynamic = "force-dynamic";

export default async function NewChallengePage() {
  await requireAdminPage();
  return <ChallengeForm />;
}
