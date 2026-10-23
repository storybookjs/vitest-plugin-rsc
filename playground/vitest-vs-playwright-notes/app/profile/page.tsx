import { NameForm } from "#components/name-form.tsx";
import { requireUser } from "#lib/auth.ts";
import { countNotes } from "#lib/notes.ts";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireUser();
  const total = await countNotes(user.id);
  const { saved } = await searchParams;
  return (
    <>
      {saved && <output>Name saved.</output>}
      <h1>Profile</h1>
      <p>Email: {user.email}</p>
      <p>You have {total === 1 ? "1 note" : `${total} notes`}.</p>
      <NameForm name={user.name} />
    </>
  );
}
