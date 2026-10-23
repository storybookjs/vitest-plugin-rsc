import { cookies } from "next/headers";
import { after, NextResponse, type NextRequest } from "next/server";
import { audit } from "./app/lib/audit.ts";
import { readByProxy, seenByProxy } from "./app/lib/proxy-log.ts";

// What runs in front of the app for a request: app/routing.test.tsx.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  seenByProxy.push(pathname);

  // Reads the body, which the route reads too.
  if (pathname === "/api/echo/read") readByProxy.push(await request.text());

  // Waits while a test holds it: app/leave.test.tsx.
  if (pathname === "/held") {
    const held = globalThis as { heldProxy?: { loading: boolean; release: Promise<void> } };
    if (held.heldProxy) {
      held.heldProxy.loading = true;
      await held.heldProxy.release;
    }
  }

  // Answers the request itself.
  if (pathname === "/proxy/ping") return NextResponse.json({ pong: true });
  // With a `Location` header that is no redirect: the status is not one.
  if (pathname === "/proxy/located") {
    return NextResponse.json({ pong: true }, { headers: { location: "https://example.com/ping" } });
  }
  if (pathname === "/proxy/broken") throw new Error("The proxy is down");
  // Does work after its response, which reads the request it belongs to:
  // app/api/route-handlers.test.ts.
  if (pathname === "/proxy/after") {
    after(async () => {
      audit(`proxy after() read ${(await cookies()).get("who")?.value ?? "no cookie"}`);
    });
    return NextResponse.json({ pong: true });
  }

  // Serves another route at this URL.
  if (pathname.startsWith("/go/")) {
    const destination = new URL(`/docs/${pathname.slice("/go/".length)}`, request.url);
    destination.searchParams.set("via", "proxy");
    return NextResponse.rewrite(destination);
  }

  if (pathname === "/team") {
    // Sends a visitor without a session elsewhere.
    if (!request.cookies.has("session")) {
      const account = new URL("/account", request.url);
      account.searchParams.set("from", pathname);
      return NextResponse.redirect(account);
    }
    // Lets the request through: with a header for the app, and a header and
    // a cookie for the browser.
    const headers = new Headers(request.headers);
    headers.set("x-team", "core");
    const response = NextResponse.next({ request: { headers } });
    response.headers.set("x-proxy", "team");
    response.cookies.set("last-team", "core");
    return response;
  }

  // Lets the request through with a `Link` header, next to the one Next
  // sends for the fonts of the page.
  if (pathname === "/fonts") {
    const response = NextResponse.next();
    response.headers.set("link", '<https://example.com/fonts>; rel="alternate"; hreflang="en"');
    return response;
  }

  // Every other request passes as it is.
}

export const config = {
  matcher: [
    {
      // What most apps have: every path, apart from the files of Next's build.
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      // And not a prefetch of a `<Link>`, which Next's production code sends
      // as a link comes into view, as Next's docs have it. The proxy cannot
      // tell one: Next takes the headers of the router off its request.
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
