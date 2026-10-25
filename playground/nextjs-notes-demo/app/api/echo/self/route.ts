// For app/request-probe/page.node.test.tsx: a route that asks another route
// of the app, with a `Request` of its own, as a server's `fetch` takes one.
export async function GET(request: Request) {
  const response = await fetch(new Request(new URL("/api/echo", request.url)));
  const echo = (await response.json()) as { method: string };
  return Response.json({ method: `self ${echo.method}` });
}
