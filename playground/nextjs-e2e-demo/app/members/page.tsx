import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "../lib/actions.ts";

// For visitors. Whoever is signed in is sent on to the account, also when
// this page renders again after the Server Action that signs in.
export default async function MembersPage() {
  if ((await cookies()).has("session")) redirect("/account");
  return (
    <>
      <h1>Members</h1>
      <form action={signIn.bind(null, "ada")}>
        <button>Sign in as ada</button>
      </form>
    </>
  );
}
