// @vitest-environment node

import { expect, test } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

test("route handlers can use documented NextRequest, NextResponse, cookies, nextUrl, and userAgent APIs", async () => {
  const request = new NextRequest(
    new Request("http://localhost/api/next-request-response?q=docs", {
      headers: {
        cookie: "demo=request-cookie",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    }),
  );

  const response = await GET(request);

  await expect(response.json()).resolves.toEqual({
    pathname: "/api/next-request-response",
    query: "docs",
    requestCookie: "request-cookie",
    userAgentBrowser: "Chrome",
  });
  expect(response.cookies.get("route-demo")?.value).toBe("ok");
  expect(response.headers.get("content-type")).toContain("application/json");
});
