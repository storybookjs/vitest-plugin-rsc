// For app/request-probe/page.node.test.tsx: a redirect that the page's
// request follows. With a body: a response of a route handler without one
// does not reach a page in Node.js yet (SB-2419).
export function GET() {
  return new Response("moved", { status: 307, headers: { location: "/api/echo" } });
}
