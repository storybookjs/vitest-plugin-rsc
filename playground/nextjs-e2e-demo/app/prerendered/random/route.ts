// A route handler that `next build` prerenders: `force-static` opts it in.
export const dynamic = "force-static";

export function GET() {
  return Response.json({ random: Math.random() });
}
