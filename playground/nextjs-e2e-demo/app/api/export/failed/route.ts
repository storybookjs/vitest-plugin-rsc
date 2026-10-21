// An export that fails on the server, which a browser saves no file for.
export function GET() {
  return new Response("The export failed", { status: 500 });
}
