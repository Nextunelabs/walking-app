import { UserDetail } from "@/components/UsersScreens.js";
import { requireAdminPage } from "@/lib/guards.js";

export const dynamic = "force-dynamic";

export default async function UserPage({ params }) {
  await requireAdminPage();
  const { id } = await params;
  return <UserDetail userId={id} />;
}
