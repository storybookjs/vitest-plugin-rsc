import { NextResponse, type NextRequest } from "next/server";
import { isFlashCookieName } from "#lib/flash-cookie.ts";

// A flash is shown once: by the response of the Server Action that set it,
// which renders the form again with it. A Server Component cannot delete a
// cookie, so the proxy does, for the request after it that renders a page:
// a GET, a later visit. It deletes the flash cookies of the browser, and
// Next takes them off the request for the page. A Server Action is a POST,
// with JavaScript or without, and keeps its flash for its own render.
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  if (request.method !== "GET") return response;
  for (const { name } of request.cookies.getAll()) {
    if (isFlashCookieName(name)) response.cookies.delete(name);
  }
  return response;
}

// Next's matcher for the requests of pages: not the API routes, nor the
// files that Next serves.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
