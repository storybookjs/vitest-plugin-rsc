import { type NextRequest, NextResponse, userAgent } from "next/server";

export async function GET(request: NextRequest) {
  const response = NextResponse.json({
    pathname: request.nextUrl.pathname,
    query: request.nextUrl.searchParams.get("q"),
    requestCookie: request.cookies.get("demo")?.value ?? null,
    requestHeader: request.headers.get("x-route-input"),
    userAgentBrowser: userAgent(request).browser.name ?? "unknown",
  });

  response.cookies.set("route-demo", "ok", { path: "/" });
  return response;
}
