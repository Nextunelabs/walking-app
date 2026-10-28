import { PublishScreen } from "@/components/PublishScreen.js";
import { requireAdminPage } from "@/lib/guards.js";

export const dynamic = "force-dynamic";

export default async function PublishPage() {
  await requireAdminPage();
  return <PublishScreen />;
}
