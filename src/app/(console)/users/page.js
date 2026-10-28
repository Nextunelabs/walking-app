import { UsersList } from "@/components/UsersScreens.js";
import { requireAdminPage } from "@/lib/guards.js";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requireAdminPage();
  return <UsersList />;
}
