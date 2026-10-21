import { cookies } from "next/headers";
import { after } from "next/server";
import { audit } from "../../lib/audit.ts";

// Work after the response that a promise passed to `after()` schedules once
// it settles, when the response has long been sent. It reads the request it
// belongs to.
export function GET() {
  after(
    (async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      after(async () => {
        audit(`late after() read ${(await cookies()).get("who")?.value ?? "no cookie"}`);
      });
    })(),
  );
  return new Response("ok");
}
