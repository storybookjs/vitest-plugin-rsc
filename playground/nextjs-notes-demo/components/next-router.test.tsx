import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("real App Page routes provide documented App Router hook values", async () => {
  await renderServer({
    url: "/note/123/hello?q=first&q=second",
  });

  await expect.element(page.getByText("pathname: /note/123/hello")).toBeVisible();
  await expect.element(page.getByText("search q: first")).toBeVisible();
  await expect.element(page.getByText("search q all: first,second")).toBeVisible();
  await expect.element(page.getByText("search has missing: false")).toBeVisible();
  await expect.element(page.getByText('params: {"id":"123","slug":"hello"}')).toBeVisible();
  await expect.element(page.getByText("selected segment: null")).toBeVisible();
  await expect.element(page.getByText("selected segments: empty")).toBeVisible();
  await expect
    .element(page.getByRole("link", { name: "Link route" }))
    .toHaveAttribute("href", "/note/link/details?q=linked");
});

test("real App Page dynamic routes provide params", async () => {
  await renderServer({
    url: "/note/123/hello?q=first&q=second",
  });

  await expect.element(page.getByText("pathname: /note/123/hello")).toBeVisible();
  await expect.element(page.getByText('params: {"id":"123","slug":"hello"}')).toBeVisible();
  await expect.element(page.getByText("selected segments: empty")).toBeVisible();
});

test("real App Page routes expose the request pathname", async () => {
  await renderServer({ url: "/router-probe?q=ok" });

  await expectRouterState({
    pathname: "/router-probe",
    searchQ: "ok",
    params: {},
    selectedSegment: "null",
    selectedSegments: "empty",
  });
});

test("next/link navigates through the real App Router request path", async () => {
  await renderServer({ url: "/router-probe?q=start" });

  await page.getByRole("link", { name: "Link route" }).click();

  await expectBrowserRoute({
    pathname: "/note/link/details",
    search: "?q=linked",
    searchQ: "linked",
    params: { id: "link", slug: "details" },
  });
});

test("router.push navigates through the real App Router request path", async () => {
  await renderServer({ url: "/router-probe?q=start" });

  await page.getByRole("button", { name: "Push route" }).click();

  await expectBrowserRoute({
    pathname: "/note/pushed/details",
    search: "?q=pushed",
    searchQ: "pushed",
    params: { id: "pushed", slug: "details" },
  });
});

test("router.replace navigates through the real App Router request path", async () => {
  await renderServer({ url: "/router-probe?q=start" });

  await page.getByRole("button", { name: "Replace route" }).click();

  await expectBrowserRoute({
    pathname: "/note/replaced/details",
    search: "?q=replaced",
    searchQ: "replaced",
    params: { id: "replaced", slug: "details" },
  });
});

test.todo("default no-URL direct ReactNode router probes require a P2 synthetic App Page fixture");

test("real App Page routes resolve encoded dynamic params", async () => {
  await renderServer({ url: "/note/a%20b/details?q=encoded" });

  await expectRouterState({
    pathname: "/note/a%20b/details",
    searchQ: "encoded",
    params: { id: "a%20b", slug: "details" },
    selectedSegment: "null",
    selectedSegments: "empty",
  });
});

test("real App Page route groups do not consume URL segments", async () => {
  await renderServer({ url: "/group-notes/123?q=group" });

  await expectRouterState({
    pathname: "/group-notes/123",
    searchQ: "group",
    params: { id: "123" },
    selectedSegment: "null",
    selectedSegments: "empty",
  });
});

test("renderServer rejects a dynamic route without matching URL params", async () => {
  await expect(() => renderServer({ url: "/", route: "/note/[id]/[slug]" })).rejects.toThrow(
    /No Next app route found|does not match pathname/,
  );
});

test("renderServer rejects static segment mismatches", async () => {
  await expect(() =>
    renderServer({
      url: "/note/123/hello",
      route: "/docs/[...slug]",
    }),
  ).rejects.toThrow(/No Next app route found|does not match pathname/);
});

test("real App Page catch-all routes expose params and selected segments", async () => {
  await renderServer({
    url: "/docs/a/b?q=docs",
  });

  await expect.element(page.getByText("pathname: /docs/a/b")).toBeVisible();
  await expect.element(page.getByText('params: {"slug":["a","b"]}')).toBeVisible();
  await expect.element(page.getByText("selected segment: null")).toBeVisible();
  await expect.element(page.getByText("selected segments: empty")).toBeVisible();
});

test("real App Page optional catch-all routes support empty params", async () => {
  await renderServer({ url: "/optional-docs?q=index" });

  await expectRouterState({
    pathname: "/optional-docs",
    searchQ: "index",
    params: {},
    selectedSegment: "null",
    selectedSegments: "empty",
  });
});

test("renderServer rejects required catch-all routes without extra segments", async () => {
  await expect(() =>
    renderServer({
      url: "/docs",
      route: "/docs/[...slug]",
    }),
  ).rejects.toThrow('No Next app route found for route "/docs/[...slug]".');
});

test.todo(
  "server actions without refresh leave the current server tree stale after the protocol worker lands",
);

test.todo("server refresh updates the current server tree after the protocol worker lands");

test.todo(
  "client router.refresh updates action-written server state after the protocol worker lands",
);

async function expectRouterState({
  pathname,
  searchQ,
  params,
  selectedSegment,
  selectedSegments,
}: {
  pathname: string;
  searchQ?: string | null;
  params: Record<string, string | string[]>;
  selectedSegment: string;
  selectedSegments: string;
}) {
  await expect.element(page.getByText(`pathname: ${pathname}`)).toBeVisible();
  if (searchQ !== undefined) {
    await expect.element(page.getByText(`search q: ${searchQ}`)).toBeVisible();
  }
  await expect.element(page.getByText(`params: ${JSON.stringify(params)}`)).toBeVisible();
  await expect.element(page.getByText(`selected segment: ${selectedSegment}`)).toBeVisible();
  await expect.element(page.getByText(`selected segments: ${selectedSegments}`)).toBeVisible();
}

async function expectBrowserRoute({
  pathname,
  search,
  searchQ,
  params,
}: {
  pathname: string;
  search: string;
  searchQ: string;
  params: Record<string, string | string[]>;
}) {
  await vi.waitFor(() => {
    expect(window.location.pathname).toBe(pathname);
    expect(window.location.search).toBe(search);
  });
  await expectRouterState({
    pathname,
    searchQ,
    params,
    selectedSegment: "null",
    selectedSegments: "empty",
  });
}
