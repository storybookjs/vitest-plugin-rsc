// A response without a body, with the status in `?status=`, 204 if there is
// none: also a 200 or a 304 with a null body.
export function GET(request: Request) {
  const status = Number(new URL(request.url).searchParams.get("status") ?? 204);
  return new Response(null, { status, headers: { "x-empty": "yes" } });
}
