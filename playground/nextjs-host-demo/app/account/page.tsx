import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/app/lib/session.ts";

export const metadata: Metadata = { title: "Account" };

// Only for who is signed in.
export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/");
  return <h1>Signed in as {user}</h1>;
}
