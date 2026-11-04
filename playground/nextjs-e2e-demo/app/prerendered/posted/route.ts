// A route handler that `revalidate` would let `next build` prerender, but
// that takes a `POST` too, which keeps it from the build: every request
// runs it. app/prerender.test.ts asks for it with a `POST` first.
export const revalidate = 60;

export function GET() {
  return Response.json({ random: Math.random() });
}

export async function POST(request: Request) {
  return Response.json({ posted: await request.text(), random: Math.random() });
}
