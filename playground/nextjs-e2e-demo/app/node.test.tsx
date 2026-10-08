import { cleanup, handleRequest, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import { page } from "vitest/browser";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ClientFrame } from "./components/client-frame.tsx";
import { Counter } from "./components/counter.tsx";
import { FavoriteButton } from "./components/favorite-button.tsx";
import { RouterState } from "./components/router-state.tsx";
import { Widget } from "./components/widget.tsx";
import { db, type Note } from "./lib/notes.ts";
import NotesPage from "./notes/page.tsx";

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.restoreAllMocks();
  db.notes.clear();
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  // React reports a hydration mismatch here, and Next a failed render.
  expect(consoleError.mock.calls).toEqual([]);
});

// A node renders on its own, the way Testing Library renders a component: in
// a container, without the app's layouts.

async function RequestInfo() {
  return (
    <dl>
      <dt>Tenant</dt>
      <dd>{(await headers()).get("x-tenant")}</dd>
      <dt>Last created</dt>
      <dd>{(await cookies()).get("last-created")?.value}</dd>
    </dl>
  );
}

test("renders a node in a container, without the layouts of the app", async () => {
  const { container, baseElement, response } = await renderServer(
    <>
      <h1>Just a counter</h1>
      <Counter />
    </>,
  );

  expect(response.status).toBe(200);
  expect(baseElement).toBe(document.body);
  expect(container.parentElement).toBe(document.body);
  await expect.element(page.getByRole("heading", { name: "Just a counter" })).toBeVisible();
  expect(container.querySelector("h1")?.textContent).toBe("Just a counter");
  await expect.element(page.getByRole("navigation", { name: "Main" })).not.toBeInTheDocument();

  // Hydrated by Next's router.
  await page.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(page.getByRole("button", { name: "Count: 1" })).toBeVisible();
});

test("renders a node at / when it gets no url, also where the app has a page", async () => {
  const { response } = await renderServer(<RouterState />);

  expect(new URL(response.url).pathname).toBe("/");
  expect(window.location.pathname).toBe("/");
  const router = page.getByRole("definition");
  await expect.element(router.nth(0)).toHaveTextContent("/");
  await expect.element(router.nth(1)).toHaveTextContent("{}");
  await expect.element(page.getByRole("heading", { name: "Home" })).not.toBeInTheDocument();
});

test("gives a node the params that the app's route has for its url", async () => {
  await renderServer(<RouterState />, { url: "/notes/7?q=1&q=2" });

  const router = page.getByRole("definition");
  await expect.element(router.nth(0)).toHaveTextContent("/notes/7");
  await expect.element(router.nth(1)).toHaveTextContent('{"id":"7"}');
  await expect.element(router.nth(2)).toHaveTextContent("q=1&q=2");
  // A node is where a page is: the last segment, with none below it.
  await expect.element(router.nth(3)).toHaveTextContent("[]");
  expect(window.location.pathname).toBe("/notes/7");
});

test("renders a node in place of a page, inside the layouts of the app, with `layouts`", async () => {
  const { container, baseElement } = await renderServer(<RouterState />, {
    url: "/notes/7?q=1",
    layouts: true,
  });

  // The root layout of the app, around the node.
  await expect.element(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  const router = page.getByRole("main").getByRole("definition");
  await expect.element(router.nth(0)).toHaveTextContent("/notes/7");
  await expect.element(router.nth(1)).toHaveTextContent('{"id":"7"}');
  await expect.element(router.nth(2)).toHaveTextContent("q=1");
  // Not the page of the route: that one has no note 7 to show.
  await expect.element(page.getByText("Nothing here")).not.toBeInTheDocument();
  // The document is the one of the route.
  expect(container).toBe(document.body);
  expect(baseElement).toBe(document.body);
  expect(document.documentElement.lang).toBe("en");
  expect(document.title).toBe("Notes");
});

test("gives a node in the layouts of a route its `wrapper` too, and its slots", async () => {
  function Tenant({ children }: { children: ReactNode }) {
    return <section aria-label="Tenant">{children}</section>;
  }

  // `app/dashboard/layout.tsx` renders a slot next to its page.
  await renderServer(<Counter />, { url: "/dashboard", layouts: true, wrapper: Tenant });

  const tenant = page.getByRole("main").getByRole("region", { name: "Tenant" });
  await tenant.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(tenant.getByRole("button", { name: "Count: 1" })).toBeVisible();
  await expect
    .element(page.getByRole("complementary", { name: "Stats" }))
    .toHaveTextContent("0 notes");
});

test("runs a Server Action of a node in the layouts of a route, and renders the node again", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "" });

  await renderServer(<FavoriteButton id="1" favorite={false} />, { url: "/notes", layouts: true });

  await page.getByRole("button", { name: "Favorite" }).click();
  await expect.element(page.getByRole("button", { name: "Favorite", pressed: true })).toBeVisible();
  expect(db.notes.get("1")?.favorite).toBe(true);
  // Still the node in the layouts, and not the page of the route.
  await expect.element(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await expect.element(page.getByRole("heading", { name: "Notes" })).not.toBeInTheDocument();
});

test("says so when `layouts` is asked for a url without a page file", async () => {
  const none = (pathname: string) => `the app has none for ${pathname}`;

  await expect(renderServer(<RouterState />, { url: "/nope", layouts: true })).rejects.toThrow(
    none("/nope"),
  );
  // A route handler has no layouts.
  await expect(
    renderServer(<RouterState />, { url: "/api/echo/a", layouts: true }),
  ).rejects.toThrow(none("/api/echo/a"));
  // `app/board` only has slots: no page for the node to stand in for.
  await expect(renderServer(<RouterState />, { url: "/board", layouts: true })).rejects.toThrow(
    none("/board"),
  );
});

test("takes no container for a node in the layouts of a route", async () => {
  const container = document.body.appendChild(document.createElement("div"));

  await expect(
    renderServer(<RouterState />, { url: "/notes", layouts: true, container }),
  ).rejects.toThrow("There is no `container` or `baseElement` to pass");
});

test("gives a node the params of a catch-all route, also of a route handler", async () => {
  await renderServer(<RouterState />, { url: "/api/echo/a/b" });

  await expect.element(page.getByRole("definition").nth(1)).toHaveTextContent('{"path":["a","b"]}');
});

test("gives a node the params of an optional catch-all route, with and without segments", async () => {
  // The app has `app/api/files/[[...path]]/route.ts`.
  await renderServer(<RouterState />, { url: "/api/files" });
  await expect.element(page.getByRole("definition").nth(1)).toHaveTextContent("{}");

  await renderServer(<RouterState />, { url: "/api/files/a/b" });
  await expect.element(page.getByRole("definition").nth(1)).toHaveTextContent('{"path":["a","b"]}');
});

test("renders a node at a url that is no route, without params", async () => {
  const { response } = await renderServer(<RouterState />, { url: "/nowhere/at/all?q=1" });

  expect(response.status).toBe(200);
  const router = page.getByRole("definition");
  await expect.element(router.nth(0)).toHaveTextContent("/nowhere/at/all");
  await expect.element(router.nth(1)).toHaveTextContent("{}");
  await expect.element(router.nth(2)).toHaveTextContent("q=1");
});

test("gives a node the request: its headers and cookies", async () => {
  document.cookie = "last-created=7";

  await renderServer(<RequestInfo />, { headers: { "x-tenant": "acme" } });

  await expect.element(page.getByText("acme")).toBeVisible();
  await expect.element(page.getByText("7", { exact: true })).toBeVisible();
});

test("sends a cookie header instead of the tab's cookies", async () => {
  document.cookie = "last-created=7";

  await renderServer(<RequestInfo />, { headers: { cookie: "last-created=9" } });

  await expect.element(page.getByText("9", { exact: true })).toBeVisible();
});

async function Tenant({ children }: { children: ReactNode }) {
  const tenant = (await headers()).get("x-tenant");
  return <section aria-label={`Tenant ${tenant}`}>{children}</section>;
}

test("wraps a node in a wrapper, which can be a Server Component", async () => {
  await renderServer(<Counter />, { wrapper: Tenant, headers: { "x-tenant": "acme" } });

  const tenant = page.getByRole("region", { name: "Tenant acme" });
  await tenant.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(tenant.getByRole("button", { name: "Count: 1" })).toBeVisible();
});

test("wraps a node in a wrapper that is a Client Component", async () => {
  await renderServer(<Counter />, { wrapper: ClientFrame });

  const frame = page.getByRole("region", { name: "Frame" });
  await frame.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(frame.getByRole("button", { name: "Count: 1" })).toBeVisible();
  // The wrapper hydrated too.
  await frame.getByRole("button", { name: "Close" }).click();
  await expect.element(frame.getByRole("button", { name: "Count: 1" })).not.toBeInTheDocument();
});

test("calls a Server Action from a node", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "" });

  await renderServer(<FavoriteButton id="1" favorite={false} />);

  await page.getByRole("button", { name: "Favorite" }).click();
  await expect.element(page.getByRole("button", { name: "Favorite", pressed: true })).toBeVisible();
  expect(db.notes.get("1")?.favorite).toBe(true);
});

test("renders a node again after a Server Action that revalidates its path", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "" });
  db.notes.set("2", { id: "2", title: "Plan the week", body: "" });
  // The page of the route, as a node: without its layouts.
  await renderServer(<NotesPage />, { url: "/notes" });
  await expect.element(page.getByRole("navigation", { name: "Main" })).not.toBeInTheDocument();

  // The action calls revalidatePath("/notes").
  await page.getByRole("button", { name: "Delete Inbox triage" }).click();

  await expect.element(page.getByRole("link", { name: "Inbox triage" })).not.toBeInTheDocument();
  await expect.element(page.getByRole("link", { name: "Plan the week" })).toBeVisible();
  expect([...db.notes.keys()]).toEqual(["2"]);
  expect(window.location.pathname).toBe("/notes");
});

test("loads the page of the app's route when a node links to it", async () => {
  const { container } = await renderServer(<Link href="/notes">All notes</Link>, {
    url: "/notes/7",
  });

  await page.getByRole("link", { name: "All notes" }).click();

  // The whole page, with its layouts: a page load, as Next's router does
  // when it leaves a route for one with another root layout.
  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  await expect.element(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  expect(window.location.pathname).toBe("/notes");
  expect(container).toBeEmptyDOMElement();
});

test("leaves the node with unmount(), and its route with it", async () => {
  const { container, unmount } = await renderServer(<h1>Not the notes</h1>, { url: "/notes" });
  await expect.element(page.getByRole("heading", { name: "Not the notes" })).toBeVisible();

  await unmount();

  expect(container).toBeEmptyDOMElement();
  expect(window.location.pathname).not.toBe("/notes");
  const response = await handleRequest("/notes");
  expect(await response.text()).toContain("<h1>Notes</h1>");
});

test("hydrates a node that renders a script, and leaves it where it is", async () => {
  const { container } = await renderServer(
    <>
      <script type="application/ld+json">{'{"@type":"Note"}'}</script>
      <Counter />
    </>,
  );

  // A script that is moved is a hydration error, which fails the test.
  await page.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(page.getByRole("button", { name: "Count: 1" })).toBeVisible();
  expect(container.querySelector("script + button")).not.toBeNull();
});

test("gives the container as a fragment, without the scripts that run", async () => {
  const { asFragment } = await renderServer(
    <p>
      Hello <b>there</b>
      <script type="application/ld+json">{'{"@type":"Note"}'}</script>
    </p>,
  );

  const fragment = asFragment();
  expect(fragment.querySelector("p")?.outerHTML).toBe(
    '<p>Hello <b>there</b><script type="application/ld+json">{"@type":"Note"}</script></p>',
  );
  // Next's and React's, which carry the Flight payload.
  expect(fragment.querySelectorAll("script")).toHaveLength(1);
});

test("renders a node in a container of the test's, which it leaves in the document", async () => {
  const baseElement = document.body.appendChild(document.createElement("main"));
  const container = baseElement.appendChild(document.createElement("section"));

  const result = await renderServer(<h1>In a section</h1>, { container, baseElement });

  expect(result.container).toBe(container);
  expect(result.baseElement).toBe(baseElement);
  await expect.element(page.getByRole("heading", { name: "In a section" })).toBeVisible();
  // As in Testing Library, the container is the base element when it gets none.
  expect((await renderServer(<h1>Again</h1>, { container })).baseElement).toBe(container);
  await cleanup();
  expect(container.isConnected).toBe(true);
  expect(container).toBeEmptyDOMElement();
  baseElement.remove();
});

test("does not take a container that holds something, or the body", async () => {
  const container = document.body.appendChild(document.createElement("section"));
  container.append("The test's own");

  await expect(renderServer(<h1>Node</h1>, { container })).rejects.toThrow(
    "the container of a node has to be empty",
  );
  await expect(renderServer(<h1>Node</h1>, { container: document.body })).rejects.toThrow(
    "the container of a node cannot be the <body>",
  );

  expect(container.textContent).toBe("The test's own");
  container.remove();
});

function Redirects({ to }: { to: string }): never {
  redirect(to);
}

test("loads the page that a node redirects to while it renders", async () => {
  const { container, response } = await renderServer(<Redirects to="/notes" />, {
    url: "/old/node/url",
  });

  // The page with its layouts, as the document, and not in the container.
  expect(new URL(response.url).pathname).toBe("/notes");
  expect(window.location.pathname).toBe("/notes");
  await expect.element(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  expect(container).toBeEmptyDOMElement();
  // The node's route went with the node.
  expect((await handleRequest("/old/node/url")).status).toBe(404);
});

test("stops a node that redirects to its own url, as a browser does", async () => {
  // Next logs nothing for a redirect. Every one of them renders the node.
  await expect(
    renderServer(<Redirects to="/old/node/url?again" />, { url: "/old/node/url" }),
  ).rejects.toThrow(/too many redirects for .*\/old\/node\/url\. The last one was to .*\?again/);

  expect((await handleRequest("/old/node/url")).status).toBe(404);
});

test("gives the node's url back when the node does not open", async () => {
  // A route handler that answers with text, which is no page.
  await expect(
    renderServer(<Redirects to="/api/plain" />, { url: "/old/node/url" }),
  ).rejects.toThrow("which is not a page to open");

  expect((await handleRequest("/old/node/url")).status).toBe(404);
});

function Missing(): never {
  notFound();
}

test("shows Next's own not-found page for a node that calls notFound()", async () => {
  const { container, response } = await renderServer(<Missing />);

  expect(response.status).toBe(404);
  // Next sends a document for it and renders the page in the tab, as it does
  // for a route without a root layout to put it in.
  await expect.element(page.getByText("This page could not be found.")).toBeVisible();
  expect(container).toBeEmptyDOMElement();
});

test("renders the page of the app at the url a node was at", async () => {
  await renderServer(<h1>Not the home page</h1>);
  await expect.element(page.getByRole("heading", { name: "Not the home page" })).toBeVisible();

  await renderServer({ url: "/" });

  await expect.element(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await expect.element(page.getByRole("navigation", { name: "Main" })).toBeVisible();
});

test("removes the container it made when the test ends", async () => {
  const { container } = await renderServer(<h1>Gone soon</h1>);

  await cleanup();

  expect(container.isConnected).toBe(false);
});

function Broken(): never {
  throw new Error("Broken node");
}

test("reports what a node throws, as Next does for a page without an error boundary", async () => {
  // Next logs the error on the server. Nothing else is logged: not a
  // hydration error either.
  consoleError.mockImplementation(() => {});
  // An uncaught error, which fails the test: what a test of a node that
  // throws gets.
  const reportError = vi.spyOn(window, "reportError").mockImplementation(() => {});

  const { container, response } = await renderServer(<Broken />);

  expect(response.status).toBe(500);
  // Next's own global error page, the one boundary of a node. It is a
  // document of its own, so it is not in the container.
  await expect
    .element(page.getByRole("heading", { name: "This page couldn’t load" }))
    .toBeVisible();
  expect(container).toBeEmptyDOMElement();
  expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: "Broken node" }));
  expect(consoleError.mock.calls.map(([error]) => String(error))).toEqual(["Error: Broken node"]);
  consoleError.mockClear();
});

test("leaves the node when a Client Component makes a React root of its own", async () => {
  const { unmount } = await renderServer(<Widget />);
  await expect.element(page.getByText("Widget")).toBeVisible();
  const widgetUnmount = vi.fn();
  window.addEventListener("widget-unmount", widgetUnmount);

  await unmount();

  window.removeEventListener("widget-unmount", widgetUnmount);
  expect(widgetUnmount).toHaveBeenCalledOnce();
});
