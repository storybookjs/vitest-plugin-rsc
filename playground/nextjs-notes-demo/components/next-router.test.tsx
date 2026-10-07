import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/next";
import { ClientRefreshProbe } from "./client-refresh-probe.tsx";
import { NextRouterProbe } from "./next-router-probe.tsx";
import {
  readServerRefreshProbe,
  resetServerRefreshProbe,
  ServerRefreshProbe,
} from "./server-refresh-probe.tsx";

// The probes render where a route of the app has its page. The routes under
// `app/fixtures` are there for that; their layout shows the selected segments.

test("App Router hooks read the URL and the params of the route", async () => {
  await renderServer(<NextRouterProbe />, {
    url: "/fixtures/router/123/hello?q=first&q=second",
  });

  await expectRouterState({
    pathname: "/fixtures/router/123/hello",
    searchQ: "first",
    params: { id: "123", slug: "hello" },
    selectedSegment: "router",
    selectedSegments: "router,123,hello",
  });
  await expect.element(page.getByText("search q all: first,second")).toBeVisible();
  await expect.element(page.getByText("search has missing: false")).toBeVisible();
  await expect
    .element(page.getByRole("link", { name: "Link route" }))
    .toHaveAttribute("href", "/fixtures/router/next/linked?q=linked");
});

test("a static route has no params", async () => {
  await renderServer(<NextRouterProbe />, { url: "/fixtures?q=ok" });

  await expectRouterState({
    pathname: "/fixtures",
    searchQ: "ok",
    params: {},
    selectedSegment: "null",
    selectedSegments: "empty",
  });
});

test("renderServer renders a node at the root route by default", async () => {
  await renderServer(<NextRouterProbe />);

  await expect.element(page.getByText("pathname: /", { exact: true })).toBeVisible();
  await expect.element(page.getByText("params: {}")).toBeVisible();
  expect(window.location.pathname).toBe("/");
});

test("dynamic params keep the encoding of the URL", async () => {
  await renderServer(<NextRouterProbe />, { url: "/fixtures/router/a%20b/c?q=encoded" });

  await expectRouterState({
    pathname: "/fixtures/router/a%20b/c",
    searchQ: "encoded",
    params: { id: "a%20b", slug: "c" },
    selectedSegment: "router",
    selectedSegments: "router,a%20b,c",
  });
});

test("route groups are in the selected segments and not in the URL", async () => {
  await renderServer(<NextRouterProbe />, { url: "/fixtures/grouped/123?q=group" });

  await expectRouterState({
    pathname: "/fixtures/grouped/123",
    searchQ: "group",
    params: { id: "123" },
    selectedSegment: "(group)",
    selectedSegments: "(group),grouped,123",
  });
});

test("router.push and router.replace navigate to another URL of the route", async () => {
  await renderServer(<NextRouterProbe />, { url: "/fixtures/router/123/hello?q=test" });
  const entries = window.history.length;

  await page.getByRole("button", { name: "Push route" }).click();

  await expect.element(page.getByText("pathname: /fixtures/router/next/pushed")).toBeVisible();
  await expect.element(page.getByText('params: {"id":"next","slug":"pushed"}')).toBeVisible();
  expect(window.location.pathname).toBe("/fixtures/router/next/pushed");
  expect(window.history.length).toBe(entries + 1);

  await page.getByRole("button", { name: "Replace route" }).click();

  await expect.element(page.getByText("pathname: /fixtures/router/next/replaced")).toBeVisible();
  expect(window.location.pathname).toBe("/fixtures/router/next/replaced");
  expect(window.history.length).toBe(entries + 1);
});

test("a catch-all route collects its segments in one param", async () => {
  await renderServer(<NextRouterProbe />, { url: "/fixtures/docs/a/b?q=docs" });

  await expectRouterState({
    pathname: "/fixtures/docs/a/b",
    searchQ: "docs",
    params: { slug: ["a", "b"] },
    selectedSegment: "docs",
    selectedSegments: "docs,a/b",
  });
});

test("an optional catch-all route matches without extra segments", async () => {
  await renderServer(<NextRouterProbe />, { url: "/fixtures/optional?q=index" });

  await expectRouterState({
    pathname: "/fixtures/optional",
    searchQ: "index",
    params: {},
    selectedSegment: "optional",
    selectedSegments: "optional",
  });
});

test("server actions without refresh leave the current server tree stale", async () => {
  resetServerRefreshProbe();

  await renderServer(<ServerRefreshProbe shouldRefresh={false} />, { url: "/fixtures" });

  await expect.element(page.getByText("server count: 0")).toBeVisible();
  await page.getByRole("button", { name: "Increment" }).click();

  await expect.poll(() => readServerRefreshProbe()).toBe(1);
  await expect.element(page.getByText("server count: 0")).toBeVisible();
});

test("server refresh updates the current server tree", async () => {
  resetServerRefreshProbe();

  await renderServer(<ServerRefreshProbe shouldRefresh />, { url: "/fixtures" });

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
    { url: "/fixtures" },
  );

  await expect.element(page.getByText("server count: 0")).toBeVisible();
  await page.getByRole("button", { name: "Increment" }).click();
  await expect.poll(() => readServerRefreshProbe()).toBe(1);
  await expect.element(page.getByText("server count: 0")).toBeVisible();

  await page.getByRole("button", { name: "Refresh router" }).click();
  await expect.element(page.getByText("server count: 1")).toBeVisible();
});

async function expectRouterState({
  pathname,
  searchQ,
  params,
  selectedSegment,
  selectedSegments,
}: {
  pathname: string;
  searchQ: string;
  params: Record<string, string | string[]>;
  selectedSegment: string;
  selectedSegments: string;
}) {
  await expect.element(page.getByText(`pathname: ${pathname}`, { exact: true })).toBeVisible();
  await expect.element(page.getByText(`search q: ${searchQ}`, { exact: true })).toBeVisible();
  await expect.element(page.getByText(`params: ${JSON.stringify(params)}`)).toBeVisible();
  await expect
    .element(page.getByText(`selected segment: ${selectedSegment}`, { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByText(`selected segments: ${selectedSegments}`, { exact: true }))
    .toBeVisible();
}
