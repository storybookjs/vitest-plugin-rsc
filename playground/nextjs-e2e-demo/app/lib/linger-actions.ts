"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

// Renders the page again, and meanwhile calls a route of the app whose work
// goes on after its response: app/api/linger/route.ts.
export async function revalidateAndCallLinger(): Promise<string> {
  revalidatePath("/");
  const origin = (await headers()).get("origin");
  const response = await fetch(`${origin}/api/linger`, { method: "POST" });
  return response.text();
}
