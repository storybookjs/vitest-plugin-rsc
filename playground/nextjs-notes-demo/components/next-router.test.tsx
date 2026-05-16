import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import {
  cleanup,
  expectToHaveBeenNavigatedTo,
  renderServer,
} from "vitest-plugin-rsc/nextjs/testing-library";
import { ClientRefreshProbe } from "./client-refresh-probe.tsx";
import { NextRouterProbe } from "./next-router-probe.tsx";
import { resetServerRefreshProbe, ServerRefreshProbe } from "./server-refresh-probe.tsx";

test("renderServer route options provide documented App Router hook values", async () => {
  await renderServer(<NextRouterProbe />, {
    url: "/note/123/hello?q=first&q=second",
    route: "/note/[id]/[slug]",
  });

  await expect.element(page.getByText("pathname: /note/123/hello")).toBeVisible();
  await expect.element(page.getByText("search q: first")).toBeVisible();
  await expect.element(page.getByText("search q all: first,second")).toBeVisible();
  await expect.element(page.getByText("search has missing: false")).toBeVisible();
  await expect.element(page.getByText('params: {"id":"123","slug":"hello"}')).toBeVisible();
  await expect.element(page.getByText("selected segment: note")).toBeVisible();
  await expect.element(page.getByText("selected segments: note,123,hello")).toBeVisible();
  await expect
    .element(page.getByRole("link", { name: "Link route" }))
    .toHaveAttribute("href", "/note/link?q=linked");
});

test("renderServer route option provides dynamic params", async () => {
  await renderServer(<NextRouterProbe />, {
    url: "/note/123/hello?q=first&q=second",
    route: "/note/[id]/[slug]",
  });

  await expect.element(page.getByText("pathname: /note/123/hello")).toBeVisible();
  await expect.element(page.getByText('params: {"id":"123","slug":"hello"}')).toBeVisible();
  await expect.element(page.getByText("selected segments: note,123,hello")).toBeVisible();
});

test("renderServer defaults the route to the URL pathname", async () => {
  await renderServer(<NextRouterProbe />, { url: "/plain?q=ok" });

  await expectRouterState({
    pathname: "/plain",
    searchQ: "ok",
    params: {},
    selectedSegment: "plain",
    selectedSegments: "plain",
  });
});

test("renderServer defaults url and route to the root segment", async () => {
  await renderServer(<NextRouterProbe />);

  await expectRouterState({
    pathname: "/",
    params: {},
    selectedSegment: "null",
    selectedSegments: "empty",
  });
});

test("renderServer resolves dynamic params from route patterns", async () => {
  await renderServer(<NextRouterProbe />, {
    url: "/notes/a%20b?q=encoded",
    route: "/notes/[id]",
  });

  await expectRouterState({
    pathname: "/notes/a%20b",
    searchQ: "encoded",
    params: { id: "a%20b" },
    selectedSegment: "notes",
    selectedSegments: "notes,a%20b",
  });
});

test("renderServer keeps route groups in the router tree without consuming URL segments", async () => {
  await renderServer(<NextRouterProbe />, {
    url: "/notes/123?q=group",
    route: "/(dashboard)/notes/[id]",
  });

  await expectRouterState({
    pathname: "/notes/123",
    searchQ: "group",
    params: { id: "123" },
    selectedSegment: "(dashboard)",
    selectedSegments: "(dashboard),notes,123",
  });
});

test("renderServer rejects a dynamic route without matching URL params", async () => {
  await expect(() => renderServer(<NextRouterProbe />, { route: "/note/[id]" })).rejects.toThrow(
    'Pattern "/note/[id]" does not match pathname "/"',
  );
});

test("renderServer rejects static segment mismatches", async () => {
  await expect(() =>
    renderServer(<NextRouterProbe />, {
      url: "/notes/123",
      route: "/posts/[id]",
    }),
  ).rejects.toThrow('Pattern "/posts/[id]" does not match pathname "/notes/123"');
});

test("renderServer records push and replace navigations", async () => {
  await renderServer(<NextRouterProbe />, {
    url: "/note/123/hello?q=test",
    route: "/note/[id]/[slug]",
  });

  await page.getByRole("button", { name: "Push route" }).click();

  await vi.waitFor(() => expectToHaveBeenNavigatedTo({ pathname: "/note/next" }));

  await page.getByRole("button", { name: "Replace route" }).click();

  await vi.waitFor(() => expectToHaveBeenNavigatedTo({ pathname: "/note/replaced" }));
});

test("cleanup clears recorded navigations", async () => {
  await renderServer(<NextRouterProbe />, {
    url: "/note/123/hello?q=test",
    route: "/note/[id]/[slug]",
  });

  await page.getByRole("button", { name: "Push route" }).click();
  await vi.waitFor(() => expectToHaveBeenNavigatedTo({ pathname: "/note/next" }));

  await cleanup();

  await expect(expectToHaveBeenNavigatedTo({ pathname: "/note/next" })).rejects.toThrow();
});

test("renderServer exposes catch-all params and selected segments", async () => {
  await renderServer(<NextRouterProbe />, {
    url: "/docs/a/b?q=docs",
    route: "/docs/[...slug]",
  });

  await expect.element(page.getByText("pathname: /docs/a/b")).toBeVisible();
  await expect.element(page.getByText('params: {"slug":["a","b"]}')).toBeVisible();
  await expect.element(page.getByText("selected segment: docs")).toBeVisible();
  await expect.element(page.getByText("selected segments: docs,a/b")).toBeVisible();
});

test("renderServer supports optional catch-all routes without extra segments", async () => {
  await renderServer(<NextRouterProbe />, {
    url: "/docs?q=index",
    route: "/docs/[[...slug]]",
  });

  await expectRouterState({
    pathname: "/docs",
    searchQ: "index",
    params: {},
    selectedSegment: "docs",
    selectedSegments: "docs",
  });
});

test("renderServer rejects required catch-all routes without extra segments", async () => {
  await expect(() =>
    renderServer(<NextRouterProbe />, {
      url: "/docs",
      route: "/docs/[...slug]",
    }),
  ).rejects.toThrow('Pattern "/docs/[...slug]" does not match pathname "/docs"');
});

test("server actions without refresh leave the current server tree stale", async () => {
  resetServerRefreshProbe();

  await renderServer(<ServerRefreshProbe shouldRefresh={false} />, {
    url: "/refresh-probe",
  });

  await expect.element(page.getByText("server count: 0")).toBeVisible();
  await page.getByRole("button", { name: "Increment" }).click();

  await expect.element(page.getByText("server count: 0")).toBeVisible();
});

test("server refresh updates the current server tree", async () => {
  resetServerRefreshProbe();

  await renderServer(<ServerRefreshProbe shouldRefresh />, {
    url: "/refresh-probe",
  });

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
    { url: "/refresh-probe" },
  );

  await expect.element(page.getByText("server count: 0")).toBeVisible();
  await page.getByRole("button", { name: "Increment" }).click();
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
