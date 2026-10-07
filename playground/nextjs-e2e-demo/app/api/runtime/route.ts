// Asks for Next's edge runtime, which is deprecated. It runs on Node.js here.
export const runtime = "edge";

export function GET() {
  return Response.json({ asked: runtime });
}
