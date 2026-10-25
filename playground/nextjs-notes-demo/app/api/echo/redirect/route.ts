// For app/request-probe/page.node.test.tsx: a redirect that the page's
// request follows, without a body, as a route handler sends one.
export function GET() {
  return new Response(null, { status: 307, headers: { location: "/api/echo" } });
}
