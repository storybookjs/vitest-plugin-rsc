// Answers with the `Set-Cookie` headers that the request lists in its body:
// what a server sends, for the tests of the app's cookies.
export async function POST(request: Request) {
  const headers = new Headers();
  for (const setCookie of (await request.json()) as string[]) {
    headers.append("set-cookie", setCookie);
  }
  return new Response(null, { status: 204, headers });
}
