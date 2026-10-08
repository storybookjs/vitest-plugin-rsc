import { NextResponse, type NextRequest } from "next/server";

// Redirects to the URL in `?to=`, with the status in `?status=`.
function redirect(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  return NextResponse.redirect(
    new URL(searchParams.get("to") ?? "/", request.url),
    Number(searchParams.get("status") ?? 307),
  );
}

export { redirect as GET, redirect as POST, redirect as PUT, redirect as DELETE };
