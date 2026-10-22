// A route handler that `force-static` would let `next build` prerender, but
// for its `POST`: Next finds a route with a method other than `GET` dynamic.
export const dynamic = "force-static";

let count = 0;

export function GET() {
  return Response.json({ count, random: Math.random() });
}

export function POST() {
  count++;
  return Response.json({ count, random: Math.random() });
}
