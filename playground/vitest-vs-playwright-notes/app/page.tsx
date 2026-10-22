import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "#lib/auth.ts";

export default async function Home() {
  if (await currentUser()) redirect("/notes");
  return (
    <>
      <h1>Notes</h1>
      <p>Write down what matters, find it again.</p>
      <Link href="/sign-up">Create an account</Link>
    </>
  );
}
