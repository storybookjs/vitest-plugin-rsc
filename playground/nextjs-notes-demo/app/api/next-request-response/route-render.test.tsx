import { expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renderServer reports route handlers as unsupported render targets", async () => {
  await expect(() => renderServer({ url: "/api/next-request-response" })).rejects.toThrow(
    /matched Next route handler "\/api\/next-request-response\/route"/,
  );
});

test("browser fetch dispatches App Route API requests through MSW", async () => {
  document.cookie = "demo=browser-cookie; path=/";
  expect(document.cookie).toContain("demo=browser-cookie");

  const response = await fetch("/api/next-request-response?q=browser-msw", {
    credentials: "include",
  });

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/json");
  await expect(response.json()).resolves.toMatchObject({
    pathname: "/api/next-request-response",
    query: "browser-msw",
    // Cookie is added below the Service Worker-visible header layer, so MSW
    // cannot observe it without a side channel.
    requestCookie: null,
  });
});

test("browser fetch observes App Route redirects through MSW Edge dispatch", async () => {
  const response = await fetch("/api/route-handler-matrix/redirect-source?mode=redirect", {
    redirect: "manual",
  });

  expect(response.type).toBe("opaqueredirect");
  expect(response.status).toBe(0);
});
