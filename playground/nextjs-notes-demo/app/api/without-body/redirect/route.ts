// A redirect to the home page, a response without a body:
// `Response.redirect()` with the status in `?status=`, 302 if there is none.
export function GET(request: Request) {
  const status = Number(new URL(request.url).searchParams.get("status") ?? 302);
  return Response.redirect(new URL("/", request.url), status);
}
