import { redirect } from "next/navigation";
import { SignInForm } from "#components/sign-in-form.tsx";
import { currentUser } from "#lib/auth.ts";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ "signed-out"?: string }>;
}) {
  if (await currentUser()) redirect("/notes");
  const signedOut = (await searchParams)["signed-out"];
  return (
    <>
      <h1>Sign in</h1>
      {signedOut && <p>You are signed out.</p>}
      <SignInForm />
    </>
  );
}
