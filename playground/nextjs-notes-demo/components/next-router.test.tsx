import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { watchPageLoad } from "#test/page-load.ts";
import { ClientRefreshProbe } from "./client-refresh-probe.tsx";
import { NextRouterProbe } from "./next-router-probe.tsx";
import {
  readServerRefreshProbe,
  resetServerRefreshProbe,
  ServerRefreshProbe,
} from "./server-refresh-probe.tsx";

// The probes render on their own, at a URL. The params are the ones the app's
// route for that URL has.

test("App Router hooks read the URL and the params of the app's route for it", async () => {
  await renderServer(<NextRouterProbe />, { url: "/notes/123/edit?q=first&q=second" });

  await expectRouterState({
    pathname: "/notes/123/edit",
    searchQ: "first",
    params: { id: "123" },
  });
  await expect.element(page.getByText("search q all: first,second")).toBeVisible();
  await expect.element(page.getByText("search has missing: false")).toBeVisible();
  await expect
    .element(page.getByRole("link", { name: "Link route" }))
    .toHaveAttribute("href", "/auth/sign-in?q=linked");
});

test("a static route has no params", async () => {
  await renderServer(<NextRouterProbe />, { url: "/notes/new?q=ok" });

  await expectRouterState({ pathname: "/notes/new", searchQ: "ok", params: {} });
});

test("renderServer renders a node at / by default", async () => {
  await renderServer(<NextRouterProbe />);

  await expect.element(page.getByText("pathname: /", { exact: true })).toBeVisible();
  await expect.element(page.getByText("params: {}")).toBeVisible();
  expect(window.location.pathname).toBe("/");
});

test("dynamic params keep the encoding of the URL", async () => {
  await renderServer(<NextRouterProbe />, { url: "/notes/a%20b?q=encoded" });

  await expectRouterState({
    pathname: "/notes/a%20b",
    searchQ: "encoded",
    params: { id: "a%20b" },
  });
});

test("a catch-all route collects its segments in one param", async () => {
  // The URL of a route handler: its params are the route's all the same.
  await renderServer(<NextRouterProbe />, { url: "/api/auth/a/b?q=docs" });

  await expectRouterState({
    pathname: "/api/auth/a/b",
    searchQ: "docs",
    params: { all: ["a", "b"] },
  });
});

test("a catch-all route does not match without extra segments, so there are no params", async () => {
  const { response } = await renderServer(<NextRouterProbe />, { url: "/api/auth?q=none" });

  expect(response.status).toBe(200);
  await expectRouterState({ pathname: "/api/auth", searchQ: "none", params: {} });
});

test("router.push and router.replace change the search params of the node's URL", async () => {
  await renderServer(<NextRouterProbe />, { url: "/notes/123?q=test" });
  const entries = window.history.length;

  await page.getByRole("button", { name: "Push search" }).click();

  await expect.element(page.getByText("search q: pushed")).toBeVisible();
  expect(window.location.search).toBe("?q=pushed");
  expect(window.history.length).toBe(entries + 1);

  await page.getByRole("button", { name: "Replace search" }).click();

  await expect.element(page.getByText("search q: replaced")).toBeVisible();
  expect(window.location.search).toBe("?q=replaced");
  expect(window.history.length).toBe(entries + 1);
  await expect.element(page.getByText('params: {"id":"123"}')).toBeVisible();
});

test("a link to a route of the app loads its page", async () => {
  await renderServer(<NextRouterProbe />, { url: "/notes/123" });
  const pageLoaded = watchPageLoad();

  await page.getByRole("link", { name: "Link route" }).click();

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Welcome back to Notes Demo" }))
    .toBeVisible();
  // The page with the layouts of the app: Next loads it as a page.
  await expect.element(page.getByRole("banner")).toBeVisible();
  expect(window.location.pathname).toBe("/auth/sign-in");
  await expect.element(page.getByText("pathname: /notes/123")).not.toBeInTheDocument();
  await pageLoaded();
});

test("server actions without refresh leave the current server tree stale", async () => {
  resetServerRefreshProbe();

  await renderServer(<ServerRefreshProbe shouldRefresh={false} />);

  await expect.element(page.getByText("server count: 0")).toBeVisible();
  await untilActionResponse(() => page.getByRole("button", { name: "Increment" }).click());

  expect(readServerRefreshProbe()).toBe(1);
  await expect.element(page.getByText("server count: 0")).toBeVisible();
});

test("server refresh updates the current server tree", async () => {
  resetServerRefreshProbe();

  await renderServer(<ServerRefreshProbe shouldRefresh />);

  await expect.element(page.getByText("server count: 0")).toBeVisible();
  await page.getByRole("button", { name: "Increment" }).click();

  await expect.element(page.getByText("server count: 1")).toBeVisible();
});

test("client router.refresh updates the current server tree", async () => {
  resetServerRefreshProbe();

  await renderServer(
    <>
      <ServerRefreshProbe shouldRefresh={false} />
      <ClientRefreshProbe />
    </>,
  );

  await expect.element(page.getByText("server count: 0")).toBeVisible();
  await untilActionResponse(() => page.getByRole("button", { name: "Increment" }).click());
  expect(readServerRefreshProbe()).toBe(1);
  await expect.element(page.getByText("server count: 0")).toBeVisible();

  await page.getByRole("button", { name: "Refresh router" }).click();
  await expect.element(page.getByText("server count: 1")).toBeVisible();
});

// Runs a Server Action and waits until the router has its whole response and
// a frame has passed: a tree that is still stale then was not refreshed.
async function untilActionResponse(trigger: () => Promise<unknown>) {
  const fetch = globalThis.fetch;
  const bodies: Promise<string>[] = [];
  globalThis.fetch = async (input, init) => {
    const response = await fetch(input, init);
    if (new Request(input, init).headers.has("next-action")) bodies.push(response.clone().text());
    return response;
  };
  try {
    await trigger();
    await expect.poll(() => bodies.length).toBe(1);
    await Promise.all(bodies);
    await new Promise((resolve) => requestAnimationFrame(resolve));
  } finally {
    globalThis.fetch = fetch;
  }
}

async function expectRouterState({
  pathname,
  searchQ,
  params,
}: {
  pathname: string;
  searchQ: string;
  params: Record<string, string | string[]>;
}) {
  await expect.element(page.getByText(`pathname: ${pathname}`, { exact: true })).toBeVisible();
  await expect.element(page.getByText(`search q: ${searchQ}`, { exact: true })).toBeVisible();
  await expect.element(page.getByText(`params: ${JSON.stringify(params)}`)).toBeVisible();
}
