import { count } from "drizzle-orm";
import { requireRole } from "#lib/auth-session.ts";
import { db } from "#lib/db.ts";
import { user } from "#db/schema.ts";

// For admins only: anyone else gets Next's 403 page, from `forbidden()`.
export default async function AdminPage() {
  await requireRole("admin");
  const [row] = await db.select({ users: count() }).from(user);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-2 px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <p className="text-muted-foreground">{row?.users ?? 0} users</p>
    </main>
  );
}
