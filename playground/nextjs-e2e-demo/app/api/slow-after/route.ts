import { cookies } from "next/headers";
import { after } from "next/server";
import { audit } from "../../lib/audit.ts";

// Work after the response that takes longer than a request waits for it, and
// reads the request it belongs to once it is done.
export function GET(request: Request) {
  const ms = Number(new URL(request.url).searchParams.get("ms") ?? "0");
  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    audit(`slow after() read ${(await cookies()).get("who")?.value ?? "no cookie"}`);
  });
  return new Response("ok");
}
