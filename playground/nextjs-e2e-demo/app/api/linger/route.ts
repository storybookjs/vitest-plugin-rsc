import { after } from "next/server";

// Answers at once, and works on after its response.
export function POST() {
  after(() => new Promise((resolve) => setTimeout(resolve, 600)));
  return Response.json({ ok: true });
}
