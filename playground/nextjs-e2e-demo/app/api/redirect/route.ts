import { NextResponse, type NextRequest } from "next/server";

// Redirects to the URL in `?to=`, with the status in `?status=`, and with the
// `Set-Cookie` header in `?cookie=`, if there is one.
function redirect(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const response = NextResponse.redirect(
    new URL(searchParams.get("to") ?? "/", request.url),
    Number(searchParams.get("status") ?? 307),
  );
  const cookie = searchParams.get("cookie");
  if (cookie) response.headers.append("set-cookie", cookie);
  return response;
}

export { redirect as GET, redirect as POST, redirect as PUT, redirect as DELETE };
