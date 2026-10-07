import { handleRequest, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import { page } from "vitest/browser";
import { headers } from "next/headers";
import { signInAs } from "../test/browser.ts";
import { RouterState } from "./components/router-state.tsx";
import { db } from "./lib/notes.ts";
import { readByProxy, seenByProxy } from "./lib/proxy-log.ts";

// What the server does with a request before a route gets it: the redirects,
// rewrites and headers of next.config.ts, and proxy.ts. Next's own route
// resolution decides, with the routes its build hands a deployment adapter.

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.restoreAllMocks();
  db.notes.clear();
  seenByProxy.length = 0;
  readByProxy.length = 0;
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  // React reports a hydration mismatch here, and Next a failed render.
  expect(consoleError.mock.calls).toEqual([]);
});

const router = () => page.getByRole("definition");

test("redirects a URL that next.config redirects", async () => {
  const response = await handleRequest("/guide/routing", { redirect: "manual" });

  expect(response.status).toBe(308);
  expect(response.headers.get("location")).toBe("/docs/routing");

  // A browser follows it.
  await renderServer({ url: "/guide/routing?tab=api" });

  await expect.element(page.getByRole("heading", { name: "Docs: routing" })).toBeVisible();
  expect(window.location.pathname + window.location.search).toBe("/docs/routing?tab=api");
});

test("serves the destination of a beforeFiles rewrite, at the URL that was asked for", async () => {
  // Without the rewrite this is the page of `/docs/[slug]` for `start`.
  const { response } = await renderServer({ url: "/docs/start?tab=api" });

  expect(response.status).toBe(200);
  await expect.element(page.getByRole("heading", { name: "Docs: getting-started" })).toBeVisible();
  // The params of the route are not search params of the page.
  await expect.element(page.getByText('Search params: {"tab":"api"}')).toBeVisible();
  // The app is where the browser is, on the server and after it has hydrated.
  expect(window.location.pathname).toBe("/docs/start");
  await expect.element(router().nth(0)).toHaveTextContent("/docs/start");
  await expect.element(router().nth(1)).toHaveTextContent('{"slug":"getting-started"}');
  await expect.element(router().nth(2)).toHaveTextContent("tab=api");
});

test("tells Next's router where a rewrite took its request", async () => {
  const response = await handleRequest("/docs/start", { headers: { rsc: "1" } });

  expect(response.headers.get("content-type")).toBe("text/x-component");
  expect(response.headers.get("x-nextjs-rewritten-path")).toBe("/docs/getting-started");

  // Next's own code says it for a rewrite of the proxy, with its query.
  const viaProxy = await handleRequest("/go/routing", { headers: { rsc: "1" } });

  expect(viaProxy.headers.get("x-nextjs-rewritten-path")).toBe("/docs/routing");
  expect(viaProxy.headers.get("x-nextjs-rewritten-query")).toBe("via=proxy");
  // The router marks its requests with a query of its own, which is not the
  // page's.
  const marked = await handleRequest("/go/routing?_rsc=abc12", { headers: { rsc: "1" } });

  expect(marked.headers.get("x-nextjs-rewritten-query")).toBe("via=proxy");
  expect(
    (await handleRequest("/docs/start?_rsc=abc12", { headers: { rsc: "1" } })).headers.has(
      "x-nextjs-rewritten-query",
    ),
  ).toBe(false);
  // Not for a request that is not rewritten, or one for a document.
  expect(
    (await handleRequest("/docs/routing", { headers: { rsc: "1" } })).headers.has(
      "x-nextjs-rewritten-path",
    ),
  ).toBe(false);
  expect((await handleRequest("/docs/start")).headers.has("x-nextjs-rewritten-path")).toBe(false);
});

test("applies an afterFiles rewrite after the routes with a fixed path, before the dynamic ones", async () => {
  // `/docs/[slug]` has this URL too, and comes later.
  const response = await handleRequest("/docs/echo?q=1");

  expect(await response.json()).toMatchObject({ path: ["docs"], query: "1" });

  // `app/docs/page.tsx` has this URL, and comes first.
  await renderServer({ url: "/docs" });

  await expect.element(page.getByRole("heading", { name: "Docs" })).toBeVisible();
});

test("applies a fallback rewrite to a URL that no route has", async () => {
  const { response } = await renderServer({ url: "/docs/routing/deep/link" });

  expect(response.status).toBe(200);
  await expect.element(page.getByRole("heading", { name: "Docs: routing" })).toBeVisible();
  expect(window.location.pathname).toBe("/docs/routing/deep/link");
});

test("rewrites to another server, and answers with its response", async () => {
  // The dev server by another name: another origin, to the tab and to Next.
  const elsewhere = `elsewhere.localhost:${window.location.port}`;

  const response = await handleRequest("/elsewhere/photos/hill.png", {
    headers: { "x-elsewhere": elsewhere },
  });

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
});

test("leaves a rewrite to the origin of the app itself to the dev server", async () => {
  // Not a request to the server in this tab, which waits for this one.
  const response = await handleRequest("/elsewhere/photos/hill.png", {
    headers: { "x-elsewhere": window.location.host },
  });

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
});

test("finds a route with a name that a URL percent-encodes", async () => {
  // `app/release notes/page.tsx`.
  const { response } = await renderServer({ url: "/release notes" });

  expect(response.status).toBe(200);
  await expect.element(page.getByRole("heading", { name: "Release notes" })).toBeVisible();
  expect(window.location.pathname).toBe("/release%20notes");
  await expect.element(router().nth(0)).toHaveTextContent("/release%20notes");
});

test("finds a dynamic route for a URL in another case, as a deployment does", async () => {
  // Next's resolution matches a pattern in any case, unless next.config has
  // `caseSensitiveRoutes`. It says which route, and with which params.
  const { response } = await renderServer({ url: "/Docs/Routing?tab=api" });

  expect(response.status).toBe(200);
  await expect.element(page.getByRole("heading", { name: "Docs: Routing" })).toBeVisible();
  await expect.element(page.getByText('Search params: {"tab":"api"}')).toBeVisible();
  await expect.element(router().nth(0)).toHaveTextContent("/Docs/Routing");
});

test("sets the headers that next.config has for a path", async () => {
  const response = await handleRequest("/docs/routing");

  expect(response.status).toBe(200);
  expect(response.headers.get("x-docs")).toBe("routing");
  expect((await handleRequest("/notes")).headers.has("x-docs")).toBe(false);
});

test("redirects a URL with a trailing slash to the one without", async () => {
  const response = await handleRequest("/docs/routing/", { redirect: "manual" });

  expect(response.status).toBe(308);
  expect(response.headers.get("location")).toBe("/docs/routing");

  await renderServer({ url: "/docs/routing/" });

  await expect.element(page.getByRole("heading", { name: "Docs: routing" })).toBeVisible();
  expect(window.location.pathname).toBe("/docs/routing");
});

test("runs the proxy for a request that next.config redirects, as Next's resolution does", async () => {
  await handleRequest("/guide/routing", { redirect: "manual" });

  // `next start` answers with the redirect before the proxy runs.
  expect(seenByProxy).toEqual(["/guide/routing"]);
});

test("runs the proxy before a route, which gets the request it lets through", async () => {
  await renderServer({ url: "/docs/routing" });

  // The module of the proxy is the one the test imports.
  expect(seenByProxy).toEqual(["/docs/routing"]);
  await expect.element(page.getByRole("heading", { name: "Docs: routing" })).toBeVisible();
});

test("serves the route the proxy rewrites to, at the URL that was asked for", async () => {
  await renderServer({ url: "/go/routing" });

  await expect.element(page.getByRole("heading", { name: "Docs: routing" })).toBeVisible();
  // The query of the destination is the page's.
  await expect.element(page.getByText('Search params: {"via":"proxy"}')).toBeVisible();
  expect(window.location.pathname + window.location.search).toBe("/go/routing");
  await expect.element(router().nth(0)).toHaveTextContent("/go/routing");
  await expect.element(router().nth(1)).toHaveTextContent('{"slug":"routing"}');
});

test("follows a redirect of the proxy", async () => {
  const response = await handleRequest("/team", { redirect: "manual" });

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("/account?from=%2Fteam");

  await renderServer({ url: "/team" });

  await expect.element(page.getByRole("heading", { name: "Account" })).toBeVisible();
  expect(window.location.pathname + window.location.search).toBe("/account?from=%2Fteam");
});

test("answers with what the proxy responds itself", async () => {
  const response = await handleRequest("/proxy/ping");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ pong: true });
});

test("gives the app the headers and the cookies the proxy sets", async () => {
  signInAs("ada");

  const { response } = await renderServer({ url: "/team" });

  // A header of the request, which the page reads with headers().
  await expect.element(page.getByText("Team: core")).toBeVisible();
  // A cookie of the response: the page reads it with cookies() in the same
  // request, and the browser has it afterwards.
  await expect.element(page.getByText("Last team: core")).toBeVisible();
  expect(document.cookie).toContain("last-team=core");
  // A header of the response.
  expect(response.headers.get("x-proxy")).toBe("team");
});

test("answers 500 when the proxy throws, and logs the error", async () => {
  consoleError.mockImplementation(() => {});

  const response = await handleRequest("/proxy/broken");

  expect(response.status).toBe(500);
  expect(consoleError.mock.calls).toEqual([[new Error("The proxy is down")]]);
  consoleError.mockClear();
});

test("sends a fetch of the page through the proxy too", async () => {
  await renderServer({ url: "/docs" });
  seenByProxy.length = 0;

  // No route has this path. The matcher of the proxy takes it, and the proxy
  // answers it.
  expect(await (await fetch("/proxy/ping")).json()).toEqual({ pong: true });

  // The proxy lets this one through, and no route has it: a file of `public/`,
  // which the dev server has.
  const image = await fetch("/photos/hill.png");

  expect(image.headers.get("content-type")).toBe("image/png");
  expect(seenByProxy).toEqual(["/proxy/ping", "/photos/hill.png"]);
});

test("gives the route the body that the proxy has read", async () => {
  const response = await handleRequest("/api/echo/read", { method: "POST", body: "Hello" });

  expect(await response.json()).toMatchObject({ method: "POST", path: ["read"], body: "Hello" });
  expect(readByProxy).toEqual(["Hello"]);
});

test("sends a Server Action through the proxy, and the page it redirects to", async () => {
  await renderServer({ url: "/notes/new" });
  seenByProxy.length = 0;

  await page.getByRole("textbox", { name: "Title" }).fill("Plan the week");
  await page.getByRole("button", { name: "Create" }).click();

  await expect.element(page.getByRole("heading", { name: "Plan the week" })).toBeVisible();
  // The action, and the request the server makes to itself for the page.
  expect(seenByProxy.slice(0, 2)).toEqual(["/notes/new", "/notes/1"]);
});

test("sends a fetch of the server to itself through the proxy", async () => {
  // The page asks a route handler of its own app.
  await renderServer({ url: "/status" });

  await expect.element(page.getByRole("heading", { name: "Status of status" })).toBeVisible();
  expect(seenByProxy).toEqual(["/status", "/api/echo/status"]);

  // And a path that no route has, which the proxy answers.
  await renderServer({ url: "/status?ask=/proxy/ping" });

  await expect.element(page.getByText('Answer: {"pong":true}')).toBeVisible();
});

test("navigates with Next's router to a URL that the proxy rewrites", async () => {
  await renderServer({ url: "/docs" });

  await page.getByRole("link", { name: "Go to routing" }).click();

  await expect.element(page.getByRole("heading", { name: "Docs: routing" })).toBeVisible();
  await expect.element(page.getByText('Search params: {"via":"proxy"}')).toBeVisible();
  expect(window.location.pathname + window.location.search).toBe("/go/routing");
  await expect.element(router().nth(0)).toHaveTextContent("/go/routing");
  await expect.element(router().nth(1)).toHaveTextContent('{"slug":"routing"}');
});

test("navigates with Next's router to a URL that is rewritten", async () => {
  await renderServer({ url: "/docs" });

  await page.getByRole("link", { name: "Start" }).click();

  await expect.element(page.getByRole("heading", { name: "Docs: getting-started" })).toBeVisible();
  expect(window.location.pathname).toBe("/docs/start");
  await expect.element(router().nth(0)).toHaveTextContent("/docs/start");
  await expect.element(router().nth(1)).toHaveTextContent('{"slug":"getting-started"}');
});

test("renders a node behind the proxy, with the params of the route it rewrites to", async () => {
  async function Team() {
    return <p>Team of the node: {(await headers()).get("x-team")}</p>;
  }
  signInAs("ada");

  await renderServer(<Team />, { url: "/team" });

  await expect.element(page.getByText("Team of the node: core")).toBeVisible();

  // The route of the node has the segments of the route the URL is rewritten to.
  await renderServer(<RouterState />, { url: "/go/routing" });

  await expect.element(router().nth(0)).toHaveTextContent("/go/routing");
  await expect.element(router().nth(1)).toHaveTextContent('{"slug":"routing"}');
});

test("intercepts a route for a visitor who comes from the page it intercepts on", async () => {
  await renderServer({ url: "/gallery" });

  await page.getByRole("link", { name: "Photo 1" }).click();

  // Next's build makes a rewrite of an interception route, for a request of
  // the router that says where it comes from.
  await expect.element(page.getByRole("dialog")).toHaveTextContent("Photo 1, over the gallery");
  await expect.element(page.getByRole("heading", { name: "Gallery" })).toBeVisible();
  expect(window.location.pathname).toBe("/gallery/photo/1");

  // Next's router keeps what it gets apart by where it came from.
  const intercepted = await handleRequest("/gallery/photo/1", {
    headers: { rsc: "1", "next-url": "/gallery" },
  });
  expect(intercepted.headers.get("vary")).toContain("next-url");

  // A page load of the same URL is the page of the photo.
  await renderServer({ url: "/gallery/photo/1" });

  await expect.element(page.getByRole("heading", { name: "Photo 1" })).toBeVisible();
  expect(page.getByRole("dialog").query()).toBeNull();
});
