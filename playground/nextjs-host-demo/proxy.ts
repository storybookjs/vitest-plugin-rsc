import { NextResponse, type NextRequest } from "next/server";

// What runs in front of the app for a request.
export function proxy(request: NextRequest) {
  // Serves another route at this URL.
  if (request.nextUrl.pathname === "/latest") {
    return NextResponse.rewrite(new URL("/notes/7", request.url));
  }
  // Every other request passes as it is.
}

export const config = {
  // What most apps have: every path, apart from the files of Next's build.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
