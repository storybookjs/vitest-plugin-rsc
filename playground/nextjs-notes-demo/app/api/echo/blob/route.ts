// For app/request-probe/page.node.test.tsx: a body of a `Blob`, and headers
// copied from the request's own `Headers`, as a route handler writes them.
export async function GET(request: Request) {
  const copied = new Headers(request.headers);
  return new Response(new Blob(["a blob"], { type: "text/plain" }), {
    headers: { "x-accept": copied.get("accept") ?? "none" },
  });
}
