import { expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renderServer reports route handlers as unsupported render targets", async () => {
  await expect(() => renderServer({ url: "/api/next-request-response" })).rejects.toThrow(
    /matched Next route handler "\/api\/next-request-response\/route"/,
  );
});

test("route handlers are invoked through MSW-routed browser fetches", async () => {
  await renderServer({ url: "/next-apis" });

  const response = await fetch("/api/next-request-response?q=docs", {
    headers: { "x-route-input": "browser-request" },
  });

  await expect(response.json()).resolves.toEqual({
    pathname: "/api/next-request-response",
    query: "docs",
    requestCookie: null,
    requestHeader: "browser-request",
    userAgentBrowser: expect.stringContaining("Chrome"),
  });
  expect(response.headers.get("content-type")).toContain("application/json");
});
