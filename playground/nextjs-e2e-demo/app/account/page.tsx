import { cookies } from "next/headers";
import { signIn } from "../lib/actions.ts";

export default async function AccountPage() {
  const session = (await cookies()).get("session")?.value;
  return (
    <>
      <h1>Account</h1>
      <p>{session ? `Signed in as ${session}` : "Signed out"}</p>
      <form action={signIn.bind(null, "ada")}>
        <button>Sign in as ada</button>
      </form>
    </>
  );
}
