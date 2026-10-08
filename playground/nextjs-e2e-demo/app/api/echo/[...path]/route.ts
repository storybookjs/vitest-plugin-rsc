import type { NextRequest } from "next/server";

type Context = { params: Promise<{ path: string[] }> };

// Says back what it was asked.
async function echo(request: NextRequest, { params }: Context) {
  return Response.json({
    method: request.method,
    path: (await params).path,
    query: request.nextUrl.searchParams.get("q"),
    body: await request.text(),
  });
}

export { echo as GET, echo as POST, echo as PUT, echo as PATCH, echo as DELETE };
