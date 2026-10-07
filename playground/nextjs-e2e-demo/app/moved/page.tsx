import { redirect } from "next/navigation";

// With the loading.tsx next to it, the response has started by the time this
// redirects: Next cannot send a 307 anymore, and redirects in the page.
export default async function MovedPage() {
  await Promise.resolve();
  redirect("/notes");
}
