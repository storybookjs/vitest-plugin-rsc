import { after } from "next/server";

// A static route, whose request has no cookies, that answers at once and
// works on after its response.
export const dynamic = "force-static";

export function GET() {
  after(() => new Promise((resolve) => setTimeout(resolve, 600)));
  return Response.json({ ok: true });
}
