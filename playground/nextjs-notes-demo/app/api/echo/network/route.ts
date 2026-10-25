// For app/request-probe/page.node.test.tsx: a route that fetches with a
// `Request` of its own, as a server's `fetch` takes one. A `data:` URL, which
// the network's `fetch` answers itself.
export async function GET() {
  const response = await fetch(new Request("data:text/plain,from%20the%20network"));
  return Response.json({ network: await response.text() });
}
