import {
  cleanup,
  clientNode,
  handleRequest,
  renderServer,
} from "vitest-plugin-rsc/nextjs/testing-library";
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import { page } from "vitest/browser";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ClientFrame } from "./components/client-frame.tsx";
import { Counter } from "./components/counter.tsx";
import { FavoriteButton } from "./components/favorite-button.tsx";
import { LingerButton } from "./components/linger-button.tsx";
import { RefreshButton } from "./components/refresh-button.tsx";
import { RouterState } from "./components/router-state.tsx";
import { Widget } from "./components/widget.tsx";
import { db } from "./lib/notes.ts";
import NotesPage from "./notes/page.tsx";
import StylesPage from "./styles/page.tsx";
import "./node.test.css";

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
// a container, without the app's layouts. And without the proxy: see
// routing.test.tsx.

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

// The plugin cannot tell which components a node renders, so a node has the
// CSS of what its test file imports, as with Vite in a component test.
test("links the CSS of a node, of its Server and Client Components", async () => {
  await renderServer(<StylesPage />);

  await expect
    .element(page.getByText("Styled by a global stylesheet"))
    .toHaveStyle({ color: "rgb(0, 0, 255)" });
  await expect
    .element(page.getByText("Styled by a CSS module in a Server Component"))
    .toHaveStyle({ color: "rgb(0, 128, 0)" });
  await expect
    .element(page.getByText("Styled by a CSS module in a Client Component"))
    .toHaveStyle({ color: "rgb(128, 0, 0)" });

  expect(getComputedStyle(document.body).backgroundColor).toBe("rgb(240, 240, 255)");

  // Not on a page of the app that does not import it.
  await renderServer({ url: "/notice" });
  await expect.element(page.getByText("The office is closed on Friday.")).toBeVisible();
  expect(getComputedStyle(document.body).backgroundColor).toBe("rgba(0, 0, 0, 0)");
});

test("links the CSS of a node in the layouts of a route, and that of the layouts", async () => {
  await renderServer(<StylesPage />, { url: "/styles", layouts: true });

  // Of the node.
  await expect
    .element(page.getByText("Styled by a CSS module in a Client Component"))
    .toHaveStyle({ color: "rgb(128, 0, 0)" });
  // Of the layout around it, which the test file does not import.
  const section = page.getByText("Styled by a global stylesheet").element().closest("section");
  expect(section && getComputedStyle(section).borderLeftColor).toBe("rgb(0, 0, 255)");
});

test("renders a node in a page with the CSS of the browser, and not that of Vitest's page", async () => {
  await renderServer(<p>Plain</p>);

  expect(getComputedStyle(document.body).margin).toBe("8px");
});

test("keeps the CSS that a test file imports itself, from one page to the next", async () => {
  await renderServer(<p className="from-test">From the test</p>);
  await expect.element(page.getByText("From the test")).toHaveStyle({ color: "rgb(255, 0, 255)" });

  await renderServer({ url: "/notice" });
  await renderServer(<p className="from-test">From the test again</p>);
  await expect
    .element(page.getByText("From the test again"))
    .toHaveStyle({ color: "rgb(255, 0, 255)" });
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
  // `app/dashboard/layout.tsx` renders a slot next to its page.
  await renderServer(<Counter />, {
    url: "/dashboard",
    layouts: true,
    wrapper: Tenant,
    headers: { "x-tenant": "acme" },
  });

  const tenant = page.getByRole("main").getByRole("region", { name: "Tenant acme" });
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

test("points to a node for a page without the layouts of its route", async () => {
  await expect(renderServer({ url: "/notes", layouts: false })).rejects.toThrow(
    "render it as a node: `renderServer(<Page />, { url })`",
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

test("gives the body of the document as the base element, also after the node is left", async () => {
  const result = await renderServer(<Link href="/notes">All notes</Link>, {
    baseElement: document.body,
  });
  expect(result.baseElement === document.body).toBe(true);
  expect(result.baseElement.contains(result.container)).toBe(true);

  await page.getByRole("link", { name: "All notes" }).click();

  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  expect(result.baseElement === document.body).toBe(true);
});

test("gives the body as the base element when the test asks for it, next to a container", async () => {
  const container = document.body.appendChild(document.createElement("section"));
  const result = await renderServer(<h1>Hello</h1>, { container, baseElement: document.body });

  expect(result.baseElement === document.body).toBe(true);
  await cleanup();
  container.remove();
});

test("keeps the attributes that the test gave the document before a node", async () => {
  document.documentElement.dataset.theme = "dark";
  document.body.dataset.density = "compact";
  const { unmount } = await renderServer(<h1>Hello</h1>);
  expect(document.body.dataset.density).toBe("compact");

  await unmount();

  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(document.body.dataset.density).toBe("compact");
  delete document.documentElement.dataset.theme;
  delete document.body.dataset.density;
});

test("says that a container which went with a page is not in the document", async () => {
  await renderServer({ url: "/" });
  // Added to the page, so it is left with the page.
  const container = document.body.appendChild(document.createElement("section"));

  await expect(renderServer(<h1>Hello</h1>, { container })).rejects.toThrow(
    "the container of a node has to be in the document",
  );
});

test("gives a node the request: its headers and cookies", async () => {
  document.cookie = "last-created=7";

  await renderServer(<RequestInfo />, { headers: { "x-tenant": "acme" } });

  await expect.element(page.getByText("acme")).toBeVisible();
  await expect.element(page.getByText("7", { exact: true })).toBeVisible();
});

test("sends a cookie header instead of the browser's cookies", async () => {
  document.cookie = "last-created=7";

  await renderServer(<RequestInfo />, { headers: { cookie: "last-created=9" } });

  await expect.element(page.getByText("9", { exact: true })).toBeVisible();
});

test("sends the headers of a node with every request after it, like a Server Action", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "" });
  db.notes.set("2", { id: "2", title: "Plan the week", body: "" });
  await renderServer(
    <>
      <RequestInfo />
      <NotesPage />
    </>,
    { url: "/notes", headers: { "x-tenant": "acme", "x-client": "test" } },
  );

  // The action calls revalidatePath("/notes"): its request renders the node again.
  await page.getByRole("button", { name: "Delete Inbox triage" }).click();
  await expect.element(page.getByRole("link", { name: "Inbox triage" })).not.toBeInTheDocument();
  await expect.element(page.getByText("acme")).toBeVisible();

  // A `fetch` of the page, and a request of the test.
  expect(await (await fetch("/api/notes/2")).json()).toMatchObject({ client: "test" });
  expect(await (await handleRequest("/api/notes/2")).json()).toMatchObject({ client: "test" });
  // A request keeps the header it sets itself.
  const own = await fetch("/api/notes/2", { headers: { "x-client": "own" } });
  expect(await own.json()).toMatchObject({ client: "own" });
});

test("sends the headers of a node with the page that the app loads from it", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "" });
  await renderServer(<Link href="/notes">All notes</Link>, {
    url: "/notes/7",
    headers: { "x-client": "test" },
  });

  // A page load, which the test did not open: see the test of it below.
  await page.getByRole("link", { name: "All notes" }).click();
  await expect.element(page.getByRole("navigation", { name: "Main" })).toBeVisible();

  expect(await (await fetch("/api/notes/1")).json()).toMatchObject({ client: "test" });
});

test("runs a Server Action behind a forwarded host, with the origin of that host", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "" });
  // Next takes the host of a Server Action from `x-forwarded-host`, and wants
  // the origin of the request to be that host.
  await renderServer(<FavoriteButton id="1" favorite={false} />, {
    headers: { "x-forwarded-host": "notes.example.com", origin: "https://notes.example.com" },
  });

  await page.getByRole("button", { name: "Favorite" }).click();
  await expect.element(page.getByRole("button", { name: "Favorite", pressed: true })).toBeVisible();
});

test("sends the headers until the test opens something else, or ends", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "" });
  const { unmount } = await renderServer(<Counter />, { headers: { "x-client": "test" } });

  // Like the cookies, they stay when the node is left.
  await unmount();
  expect(await (await fetch("/api/notes/1")).json()).toMatchObject({ client: "test" });

  await renderServer(<Counter />);
  expect(await (await fetch("/api/notes/1")).json()).toMatchObject({ client: null });

  await renderServer(<Counter />, { headers: { "x-client": "test" } });
  await cleanup();
  expect(await (await fetch("/api/notes/1")).json()).toMatchObject({ client: null });
});

test("sends the headers of what the test asked to open, also when it did not open", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "" });

  // A route handler, which is no page.
  await expect(
    renderServer({ url: "/api/plain", headers: { "x-client": "test" } }),
  ).rejects.toThrow("which is not a page to open");

  expect(await (await fetch("/api/notes/1")).json()).toMatchObject({ client: "test" });
});

test("leaves a Server Action the content type of its own body", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "" });
  await renderServer(<FavoriteButton id="1" favorite={false} />, {
    headers: { "content-type": "text/plain" },
  });

  await page.getByRole("button", { name: "Favorite" }).click();
  await expect.element(page.getByRole("button", { name: "Favorite", pressed: true })).toBeVisible();
});

test("sends a cookie header with the document alone, and the browser's cookies after it", async () => {
  await renderServer(<RequestInfo />, { headers: { cookie: "last-created=9" } });
  await expect.element(page.getByText("9", { exact: true })).toBeVisible();

  document.cookie = "last-created=7";
  // `/api/notes/latest` redirects to the note of the `last-created` cookie.
  const response = await handleRequest("/api/notes/latest", { redirect: "manual" });
  expect(response.headers.get("location")).toBe("/notes/7");
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

test("renders the node again after its action called a route whose after() is still running", async () => {
  await renderServer(
    <>
      <p>Node here</p>
      <LingerButton />
    </>,
  );

  await page.getByRole("button", { name: "Result: none" }).click();

  await expect.element(page.getByRole("button", { name: 'Result: {"ok":true}' })).toBeVisible();
  await expect.element(page.getByText("Node here")).toBeVisible();
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
  // Next sends a document for it and renders the page in the browser, as it
  // does for a route without a root layout to put it in.
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

// How many times the server has rendered it.
let greetings = 0;

async function Greeting({ name }: { name: string }) {
  greetings++;
  return (
    <section aria-label="Greeting">
      <h2>Hello {name}</h2>
      <Counter />
    </section>
  );
}

// What the page has asked the app for: the pathname, and whether it was a
// request of Next's router.
function requestsOf(fetch: MockInstance<typeof window.fetch>) {
  return fetch.mock.calls.map(([input, init]) => {
    const request = input instanceof Request ? input : undefined;
    const url = new URL(request?.url ?? String(input), window.location.href);
    const headers = new Headers(init?.headers ?? request?.headers);
    return { pathname: url.pathname, router: headers.has("rsc") };
  });
}

test("renders a node again with rerender(), in one request of the router and without a page load", async () => {
  greetings = 0;
  const { container, rerender } = await renderServer(<Greeting name="Ada" />);
  await page.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(page.getByRole("button", { name: "Count: 1" })).toBeVisible();
  const button = container.querySelector("button");
  const fetch = vi.spyOn(window, "fetch");

  await rerender(<Greeting name="Grace" />);

  // The page has the new node once rerender() resolves.
  expect(container.querySelector("h2")?.textContent).toBe("Hello Grace");
  // The same element, with the state of its Client Component.
  expect(container.querySelector("button")).toBe(button);
  expect(button?.textContent).toBe("Count: 1");
  expect(requestsOf(fetch)).toEqual([{ pathname: "/", router: true }]);
  // Once for the document, once for the rerender.
  expect(greetings).toBe(2);
});

test("renders a node again with the wrapper and the headers it was rendered with", async () => {
  greetings = 0;
  const { rerender } = await renderServer(
    <>
      <Greeting name="Ada" />
      <RefreshButton />
    </>,
    { url: "/notes/7", wrapper: Tenant, headers: { "x-tenant": "acme" } },
  );
  await page.getByRole("button", { name: "Count: 0" }).click();

  await rerender(
    <>
      <Greeting name="Grace" />
      <RefreshButton />
    </>,
  );

  const tenant = page.getByRole("region", { name: "Tenant acme" });
  await expect.element(tenant.getByRole("heading", { name: "Hello Grace" })).toBeVisible();
  await expect.element(tenant.getByRole("button", { name: "Count: 1" })).toBeVisible();
  expect(window.location.pathname).toBe("/notes/7");
  // And so does a refresh of the app's own.
  await tenant.getByRole("button", { name: "Refresh" }).click();
  await expect.poll(() => greetings).toBe(3);
  await expect.element(tenant.getByRole("heading", { name: "Hello Grace" })).toBeVisible();
});

test("renders a node in the layouts of a route again", async () => {
  const { rerender } = await renderServer(<Greeting name="Ada" />, {
    url: "/notes",
    layouts: true,
  });
  await page.getByRole("button", { name: "Count: 0" }).click();

  await rerender(<Greeting name="Grace" />);

  const main = page.getByRole("main");
  expect(main.getByRole("heading", { name: "Hello Grace" }).query()).not.toBeNull();
  expect(main.getByRole("button", { name: "Count: 1" }).query()).not.toBeNull();
  await expect.element(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  // Still the node, and not the page of the route.
  await expect.element(page.getByRole("heading", { name: "Notes" })).not.toBeInTheDocument();
});

const hydrated = (element: Element | null) =>
  Object.keys(element ?? {}).some((key) => key.startsWith("__reactFiber$"));

test("renders a node again while its route still hydrates, and the last of two rerenders", async () => {
  // `/notes/7` has a `loading.tsx`, whose boundary hydrates after the page.
  const { rerender } = await renderServer(<Greeting name="Ada" />, {
    url: "/notes/7",
    layouts: true,
  });
  expect(hydrated(document.querySelector("main h2")), "the node has hydrated").toBe(false);

  await Promise.all([rerender(<Greeting name="Grace" />), rerender(<Greeting name="Linus" />)]);

  const main = page.getByRole("main");
  expect(main.getByRole("heading", { name: "Hello Linus" }).query()).not.toBeNull();
  await main.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(main.getByRole("button", { name: "Count: 1" })).toBeVisible();
});

test("does not render a node again once it has navigated to another page, or was left", async () => {
  const left = "renders the node again on its page, which was left";
  const first = await renderServer(<Link href="/notes">All notes</Link>, { url: "/notes/7" });
  await page.getByRole("link", { name: "All notes" }).click();
  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeVisible();

  await expect(first.rerender(<p>Again</p>)).rejects.toThrow(left);

  const second = await renderServer(<p>Second</p>);
  await second.unmount();
  await expect(second.rerender(<p>Again</p>)).rejects.toThrow(left);

  const third = await renderServer(<p>Third</p>);
  const rendering = third.rerender(<p>Again</p>);
  await cleanup();
  await expect(rendering).rejects.toThrow("The page was left before the node had rendered again");
});

test("hears no more of the request of a rerender() once the node is left, also on the next page", async () => {
  const { rerender, unmount } = await renderServer(<Greeting name="Ada" />);
  // Its router asks the server for the node again, which leaving stops.
  const rendering = rerender(<Greeting name="Grace" />);

  await unmount();

  await expect(rendering).rejects.toThrow("The page was left before the node had rendered again");
  // What runs between two tests, and the page of the next one.
  await cleanup();
  await renderServer(<Greeting name="Linus" />);
  await page.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(page.getByRole("button", { name: "Count: 1" })).toBeVisible();
  // The router of the page that was left would report the stopped request as
  // a failed fetch: "Failed to fetch RSC payload".
  expect(consoleError).not.toHaveBeenCalled();
});

test("does not render a node in the layouts of a route again once the app shows another page", async () => {
  const { rerender } = await renderServer(<Greeting name="Ada" />, {
    url: "/notes",
    layouts: true,
  });

  // A page of the app with the same root layout, which Next's router renders
  // on the client.
  await page.getByRole("link", { name: "Notice" }).click();
  await expect.element(page.getByText("The office is closed on Friday.")).toBeVisible();

  await expect(rerender(<Greeting name="Grace" />)).rejects.toThrow(
    "the page has something else there",
  );
  // A node of the browser layer for one of the server is another node.
  await expect(
    rerender(clientNode("/app/components/press-button.tsx", "PressButton", {})),
  ).rejects.toThrow("rerender() takes a node of the server");
});

test("shows the error of a node that throws when it renders again, and renders it no more", async () => {
  // Next logs the error on the server, and reports it as uncaught: Next's
  // own global error page is the one boundary of a node.
  consoleError.mockImplementation(() => {});
  const reportError = vi.spyOn(window, "reportError").mockImplementation(() => {});
  const { rerender } = await renderServer(<Greeting name="Ada" />);

  await rerender(<Broken />);

  await expect
    .element(page.getByRole("heading", { name: "This page couldn’t load" }))
    .toBeVisible();
  expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: "Broken node" }));
  await expect(rerender(<Greeting name="Grace" />)).rejects.toThrow(
    "the page has something else there: an error or a not-found page",
  );
  consoleError.mockClear();
});

// What a host like Storybook renders for a story with `"use client"`: an
// export of a module of the browser layer, with the props as they are. This
// file is of the server, and cannot make such a node itself.
test("renders an export of a module of the browser layer, with a function as a prop", async () => {
  const onPress = vi.fn();
  const press = clientNode("/app/components/press-button.tsx", "PressButton", {
    onPress,
    children: "Press",
  });

  const { container, response } = await renderServer(press, {
    url: "/notes/7",
    wrapper: Tenant,
    headers: { "x-tenant": "acme" },
  });

  // The server renders the wrapper, and leaves the node to the browser.
  expect(await handleRequest("/notes/7").then((again) => again.text())).not.toContain("Press");
  expect(response.status).toBe(200);
  expect(container.querySelector("button")?.textContent).toBe("Press");
  await page.getByRole("region", { name: "Tenant acme" }).getByRole("button").click();
  expect(onPress).toHaveBeenCalledOnce();
  expect(window.location.pathname).toBe("/notes/7");
});

test("renders a node of the browser layer again in the browser, without a request", async () => {
  const press = (props: Record<string, unknown>) =>
    clientNode("/app/components/press-button.tsx", "PressButton", props);
  const { container, rerender } = await renderServer(
    press({ onPress: vi.fn(), children: "Press" }),
    { wrapper: Tenant, headers: { "x-tenant": "acme" } },
  );
  const button = container.querySelector("button");
  const fetch = vi.spyOn(window, "fetch");
  const onPress = vi.fn();

  await rerender(press({ onPress, children: "Press again" }));

  expect(container.querySelector("button")).toBe(button);
  expect(button?.textContent).toBe("Press again");
  await page.getByRole("region", { name: "Tenant acme" }).getByRole("button").click();
  expect(onPress).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled();
  // A node of the server for one of the browser layer is another node.
  await expect(rerender(<p>Server</p>)).rejects.toThrow(
    "rerender() takes a node of the browser layer",
  );
});
