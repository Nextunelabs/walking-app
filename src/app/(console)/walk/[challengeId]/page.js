import { WalkTracker } from "@/components/WalkTracker.js";
import { requirePageUser } from "@/lib/guards.js";

export const dynamic = "force-dynamic";

export default async function WalkPage({ params }) {
  await requirePageUser();
  const { challengeId } = await params;
  return <WalkTracker challengeId={challengeId} />;
}
