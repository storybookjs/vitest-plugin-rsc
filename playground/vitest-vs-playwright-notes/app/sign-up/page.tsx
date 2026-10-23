import { redirect } from "next/navigation";
import { SignUpForm } from "#components/sign-up-form.tsx";
import { currentUser } from "#lib/auth.ts";

export default async function SignUpPage() {
  if (await currentUser()) redirect("/notes");
  return (
    <>
      <h1>Create an account</h1>
      <SignUpForm />
    </>
  );
}
