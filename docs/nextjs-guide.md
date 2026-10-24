# Testing a Next.js app

Everything you can do with `vitest-plugin-rsc/nextjs/testing-library`, one example at a time. This assumes you've done the [quick start](../README.md#quick-start). Need the exact signature of something? That's in the [API reference](api.md).

- [Render a component](#render-a-component)
- [Open a whole route](#open-a-whole-route)
- [Forms and Server Actions](#forms-and-server-actions)
- [Router hooks and links](#router-hooks-and-links)
- [Headers and cookies](#headers-and-cookies)
- [localStorage and sessionStorage](#localstorage-and-sessionstorage)
- [Caching and revalidation](#caching-and-revalidation)
- [Route handlers](#route-handlers)
- [Code that a Server Action calls](#code-that-a-server-action-calls)
- [The proxy, redirects and rewrites](#the-proxy-redirects-and-rewrites)
- [Mocks](#mocks)
- [Fonts, images and styles](#fonts-images-and-styles)
- [Server code in the browser](#server-code-in-the-browser)
- [Environment variables](#environment-variables)
- [Test isolation](#test-isolation)
- [Development or production](#development-or-production)
- [Watch mode](#watch-mode)

> [!TIP]
> Got a Client Component that only takes props, like a button from your design system? You can test it without Next at all. See [Testing Client Components](use-client-test-files.md).

## Render a component

Pass a node to `renderServer` to test one component:

```tsx
await renderServer(<CreateNoteForm />);
```

It lands in a `<div>` in `document.body`, just like with Testing Library, and without your layouts. But everything around it is real Next: the request, cookies, Server Actions, the cache and the router.

By default the node renders at `/`. Pass a `url` and the pathname, search params and route params come from that URL instead. A node skips `proxy.ts`, so a component behind a sign-in renders without one.

One thing to keep in mind: the node lives in the test's own page. A component that reloads the page (with `location.reload()`, or a `<form method="get">` without an `action`) reloads the test's tab, exactly like it would without the plugin.

### Wrap it in providers

Use `wrapper` to give a node the providers a layout would. It can even be a Server Component:

```tsx
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { Counter } from "./components/counter.tsx";

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
```

### Render it inside your layouts

Or skip the wrapper and use the real thing. `layouts: true` puts the node inside your app's layouts for that `url`, with their providers, global CSS and data:

```tsx
import { RouterState } from "./components/router-state.tsx";

test("renders a node in place of a page, inside the layouts of the app", async () => {
  await renderServer(<RouterState />, { url: "/notes/7?q=1", layouts: true });

  // The root layout of the app, around the node.
  await expect.element(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  const router = page.getByRole("main").getByRole("definition");
  await expect.element(router.nth(1)).toHaveTextContent('{"id":"7"}');
});
```

Without `layouts`, a node only gets the CSS that its test file and setup files import. Want your global CSS everywhere? Import it in a setup file.

### How much of the app is around it

Two options decide that: `proxy` runs `proxy.ts` plus the redirects, rewrites and headers from `next.config`, and `layouts` renders your layouts. The defaults:

|                                   | `proxy` | `layouts` |
| --------------------------------- | ------- | --------- |
| `renderServer({ url })`           | `true`  | `true`    |
| `renderServer(<Node />, { url })` | `false` | `false`   |

For a node you can turn on both. For example, to render a component inside its route's layouts, behind the proxy that guards it:

```tsx
import { headers } from "next/headers";

// Reads the header that proxy.ts adds for a signed-in visitor.
async function Team() {
  return <p>Team: {(await headers()).get("x-team")}</p>;
}

test("renders a node in the layouts of a route, behind the proxy", async () => {
  await renderServer(<Team />, {
    url: "/team",
    layouts: true,
    proxy: true,
    headers: { cookie: "session=ada" },
  });

  await expect.element(page.getByRole("main")).toHaveTextContent("Team: core");
});
```

To render a node again with new props, without a page load, use [`rerender()`](api.md#rerenderui).

## Open a whole route

`renderServer({ url })` opens a route like a browser does. Next's request handler renders it, the browser shows the HTML, and Next's client hydrates it. Once `renderServer` resolves, Next's router is in charge, so links, forms and redirects behave as in your app.

```tsx
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { db } from "./lib/notes.ts";

test("navigates on the client with next/link", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "Sort the inbox" });
  await renderServer({ url: "/" });

  await page.getByRole("link", { name: "Notes", exact: true }).click();
  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  expect(window.location.pathname).toBe("/notes");

  await page.getByRole("link", { name: "Inbox triage" }).click();
  await expect.element(page.getByText("Sort the inbox")).toBeVisible();
  expect(window.location.pathname).toBe("/notes/1");
  await expect.poll(() => document.title).toBe("Inbox triage | Notes");
});
```

`ssr: false` opens the page without HTML from the server: the browser renders it from its Flight payload, as Next does for its error page. The test no longer sees the server's HTML, or a hydration mismatch. In [fast mode](#fast-mode), `keepApp` opens every page this way, and `ssr: true` opts a test out of it.

It resolves with `{ response, errors, unmount }`: the server's `Response`, any errors React reported, and a function to leave the page.

```tsx
const { response } = await renderServer({ url: "/" });

expect(response.status).toBe(200);
```

Headers you pass go along with this request and every later one from the page. A `cookie` header sets cookies (more on that in [Headers and cookies](#headers-and-cookies)):

```tsx
test("sends the cookies of a cookie header with the page", async () => {
  await renderServer({ url: "/notes", headers: { cookie: "last-created=7" } });

  await expect.element(page.getByText("Last created: 7")).toBeVisible();
});
```

A few things worth knowing:

- The first load of a page waits for the whole document, so you won't see `loading.tsx` or a Suspense fallback. Navigations inside the app do show them.
- A URL that isn't a route gets your not-found page, with a `404`.

## Forms and Server Actions

This is where the plugin shines: seed some state, use the form, check what happened. Here's a page with a Server Action that writes a validation error to a cookie:

```tsx
// app/notes/new/page.tsx
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { notes } from "#db/schema.ts";
import { requireUser } from "#lib/auth-session.ts";
import { db } from "#lib/db.ts";

export default async function NewNotePage() {
  const user = await requireUser();
  const error = (await cookies()).get("note-error")?.value;

  return (
    <form
      action={async (formData) => {
        "use server";

        const title = String(formData.get("title") ?? "").trim();
        const content = String(formData.get("content") ?? "");

        if (!title) {
          (await cookies()).set("note-error", "Title is required.");
          refresh();
          return;
        }

        await db.insert(notes).values({ ownerId: user.id, title, content });
        redirect("/notes");
      }}
    >
      <label htmlFor="title">Title</label>
      <input id="title" name="title" />
      {error && <p>{error}</p>}

      <label htmlFor="content">Content</label>
      <textarea id="content" name="content" />

      <button>Create note</button>
    </form>
  );
}
```

The test seeds server state (a signed-in user, a database row) _and_ browser state (`localStorage`), then uses the form:

```tsx
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

import { db } from "#lib/db.ts";
import { notes } from "#db/schema.ts";
import { signedInAs, testUser } from "#test/auth.ts";
import NewNotePage from "./page.tsx";

test("validates a new note without losing entered content", async () => {
  await signedInAs(testUser);
  localStorage.setItem("theme", "dark");

  await db.insert(notes).values({
    ownerId: testUser.id,
    title: "Inbox triage",
    content: "Existing note body",
  });

  await renderServer(<NewNotePage />, { url: "/notes/new" });

  await page.getByLabelText("Content").fill("Keep this body");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
  await expect.element(page.getByDisplayValue("Keep this body")).toBeInTheDocument();
});
```

A unit test can't set up server and browser state together. An E2E test can only get there by clicking through the UI. This test just... does it.

Where does `db` come from? A setup file calls `vi.mock("#lib/db.ts")`, which swaps in `lib/__mocks__/db.ts`: the same ORM on an in-memory PGlite database, plus a `resetDb()` that runs before each test. See [Databases](databases.md).

## Router hooks and links

Pass a `url` when a component needs to know where it is. `usePathname`, `useSearchParams`, `useParams` and `next/link` all work as usual:

```tsx
"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";

export function NoteToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  return (
    <>
      <p>pathname: {pathname}</p>
      <p>note id: {params.id}</p>
      <p>tab: {searchParams.get("tab")}</p>
      <button onClick={() => router.push("/notes")}>Go to notes</button>
      <Link href={{ pathname: "/notes/new", query: { from: params.id } }}>New note</Link>
    </>
  );
}
```

```tsx
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

import { NoteToolbar } from "./note-toolbar";

test("reads router state and navigates", async () => {
  await renderServer(<NoteToolbar />, { url: "/notes/123?tab=activity" });

  await expect.element(page.getByText("pathname: /notes/123")).toBeVisible();
  await expect.element(page.getByText("note id: 123")).toBeVisible();
  await expect.element(page.getByText("tab: activity")).toBeVisible();

  await page.getByRole("button", { name: "Go to notes" }).click();
  await expect.poll(() => window.location.pathname).toBe("/notes");
});
```

The params come from your app's route for that URL. Navigating to another route opens that page, with its layouts, just like a click in the browser.

## Headers and cookies

Use `headers()` and `cookies()` in your server code as you always do. In the test, pass request headers to `renderServer`:

```tsx
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

import { FlashProbe } from "./flash-probe";

test("reads request headers and mutates cookies from an action", async () => {
  const requestHeaders = new Headers();
  requestHeaders.set("x-test-request", "from-test");
  requestHeaders.set("cookie", "flash=initial");

  await renderServer(<FlashProbe />, {
    url: "/flash",
    headers: requestHeaders,
  });

  await expect.element(page.getByText("request id: from-test")).toBeVisible();
  await expect.element(page.getByText("flash: initial")).toBeVisible();

  await page.getByRole("button", { name: "Save flash" }).click();
  await expect.element(page.getByText("flash: saved")).toBeVisible();
});
```

```tsx
import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";

export async function FlashProbe() {
  const requestId = (await headers()).get("x-test-request");
  const flash = (await cookies()).get("flash")?.value ?? "empty";

  return (
    <form
      action={async () => {
        "use server";

        (await cookies()).set("flash", "saved", { path: "/" });
        refresh();
      }}
    >
      <p>request id: {requestId}</p>
      <p>flash: {flash}</p>
      <button>Save flash</button>
    </form>
  );
}
```

The headers you pass stick around: Server Actions, `router.refresh()`, navigations and `fetch` calls from the page all get them, until the test opens something else. Handy for headers a server in front of your app would add, like `x-forwarded-for`. (An `accept` header only applies to the first request.)

### How cookies work

The plugin keeps cookies for your app just like a browser keeps them for a site:

- **A `cookie` header** passed to `renderServer` sets cookies, and they stay until your app changes them or the test ends.
- **Every request to your app sends them**: page loads, navigations, Server Actions, route handlers, `fetch`.
- **`Set-Cookie` from your server** sets or deletes cookies, as you'd expect.
- **A cookie is just a name and a value here.** `Path`, `Domain` and `Secure` don't matter.
- **Each test starts with no cookies.**

`document.cookie` shows your app's cookies, minus the `HttpOnly` ones, just like a browser. So a Client Component that stores state in a cookie (like shadcn/ui's sidebar) works.

Need an `HttpOnly` cookie in a test? Set it from a Server Action with `runInServerAction`:

```ts
await runInServerAction(async () => (await cookies()).set("session", "ada", { httpOnly: true }));
```

### Reading and changing cookies in a test

Assert on what the page renders, read the response's `Set-Cookie`, or read `cookies()` from a Server Action:

```ts
import { cookies } from "next/headers";
import { expect, test } from "vitest";
import { handleRequest, runInServerAction } from "vitest-plugin-rsc/nextjs/testing-library";

test("keeps the cookie a route handler sets", async () => {
  const response = await handleRequest("/api/notes/1");
  expect(response.headers.getSetCookie()).toEqual(["last-read=1; Path=/"]);

  const lastRead = await runInServerAction(async () => (await cookies()).get("last-read")?.value);
  expect(lastRead).toBe("1");
});
```

Deleting a cookie mid-test works the same way:

```ts
await runInServerAction(async () => (await cookies()).delete("session"));
```

A few details, in case you need them:

- A `cookie` header passed to `handleRequest` or `runInServerAction` is used _instead of_ your app's cookies, for that one request.
- A request with `credentials: "omit"` sends no cookies and keeps none.
- There's no `cookieStore` on the page.
- MSW writes cookies from mocked responses into `document.cookie`, so a non-`HttpOnly` cookie from a mocked API becomes your app's cookie.
- The browser's own cookies for `localhost` (from Vitest's UI, say) are separate. Your app never sees them.

## localStorage and sessionStorage

Same idea as cookies: `localStorage` and `sessionStorage` belong to your app, and every test starts with both empty. Each test gets a fresh browser context, a bit like a new Playwright context.

Some practical tips:

- **Seed in `beforeEach()` or the test itself.** Anything written in `beforeAll()` or at the top level of a file goes to the browser's own storage, not your app's.
- **Spy on `localStorage`, not `Storage.prototype`.** Your app's storage is the plugin's own object.
- **Spy on `fetch` in the test or a `beforeEach()`.** A spy set up earlier sits underneath your app's `fetch`.
- **DevTools and Playwright's `storageState()`** show the browser's storage, not your app's.

See [Web Storage](internals/next-routes.md#web-storage) for the finer points.

## Caching and revalidation

Cached `fetch`, tags, `revalidateTag()`, `updateTag()` and `refresh()` all work. Use [MSW](https://mswjs.io/docs/recipes/vitest-browser-mode) to answer the outgoing `fetch`. The [notes demo](../playground/nextjs-notes-demo) has a full setup.

```tsx
import { refresh, revalidatePath, revalidateTag, updateTag } from "next/cache";

import { createNote } from "#lib/notes";

async function readNotes() {
  const response = await fetch("https://example.test/api/notes", {
    cache: "force-cache",
    next: { tags: ["notes"] },
  });
  return response.json() as Promise<Array<{ id: string; title: string }>>;
}

export async function NotesPanel() {
  const notes = await readNotes();

  return (
    <section>
      <p>notes: {notes.length}</p>
      <form
        action={async () => {
          "use server";

          await createNote({ title: "New note" });
          updateTag("notes");
        }}
      >
        <button>Create note</button>
      </form>
      <form
        action={async () => {
          "use server";

          revalidateTag("notes", "max");
          refresh();
        }}
      >
        <button>Refresh stale notes</button>
      </form>
      <form
        action={async () => {
          "use server";

          revalidateTag("notes", { expire: 0 });
        }}
      >
        <button>Expire notes cache</button>
      </form>
      <form
        action={async () => {
          "use server";

          revalidatePath("/notes", "page");
        }}
      >
        <button>Revalidate notes page</button>
      </form>
    </section>
  );
}
```

The test still reads like a unit test. Click, and `updateTag("notes")` busts the cache, the panel renders again, and the count goes up:

```tsx
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

import { NotesPanel } from "./notes-panel";

test("creating a note invalidates the notes cache", async () => {
  await renderServer(<NotesPanel />, { url: "/notes" });

  await expect.element(page.getByText("notes: 0")).toBeVisible();
  await page.getByRole("button", { name: "Create note" }).click();
  await expect.element(page.getByText("notes: 1")).toBeVisible();
});
```

### `"use cache"`

With `cacheComponents` in your `next.config`, `"use cache"` works too, on a function, a component, or a whole module. `cacheTag()` and `cacheLife()` work, even after an `await`. From `playground/nextjs-cache-components-demo`:

```ts
// app/lib/quotes.ts
import { cacheLife, cacheTag } from "next/cache";

export async function getQuote(topic: string) {
  "use cache";
  await delay(1);
  cacheTag("quotes", `quote-${topic}`);
  cacheLife("hours");
  return { topic, runs: ++runs, author: await getAuthor(topic.length) };
}
```

Just like in a deployment, `cookies()` throws inside a cached function. Nothing is prerendered, so a page that reads the request outside a `<Suspense>` boundary still renders. More in [Caching](internals/next-routes.md#caching).

## Route handlers

`handleRequest(url, init)` sends one request to your app and gives you the `Response`. Same arguments as `fetch`. Use it when you care about the response itself: a status, a header, some JSON.

```ts
import { expect, test } from "vitest";
import { handleRequest } from "vitest-plugin-rsc/nextjs/testing-library";
import { db } from "../lib/notes.ts";

test("gives a route handler the body of a request and its cookie header", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "Sort the inbox" });

  const response = await handleRequest("/api/notes/1", {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: "editor=kasper" },
    body: JSON.stringify({ title: "Inbox zero" }),
  });

  expect(await response.json()).toEqual({
    note: { id: "1", title: "Inbox zero", body: "Sort the inbox" },
    editor: "kasper",
  });
  expect(db.notes.get("1")?.title).toBe("Inbox zero");
  // Set with cookies() in the handler.
  expect(response.headers.getSetCookie()).toEqual(["last-renamed=1; Path=/"]);
});
```

The request carries your app's cookies (unless you pass a `cookie` header), plus any headers from whatever `renderServer` opened. Cookies the response sets are kept.

A `fetch` from a Client Component reaches your route handlers too. Like in a browser, it can't see `Set-Cookie` headers. `handleRequest` can.

## Code that a Server Action calls

The best way to test a form's action is through its page: fill in the form, submit. But for the code an action _calls_, there's `runInServerAction(fn, { url })`. It runs your function as a Server Action of the page at `url`, so `cookies()`, `redirect()`, `refresh()` and `after()` all work. You get back whatever it returns, or the error it throws (including `redirect()` and `notFound()`):

```ts
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { cookies } from "next/headers";
import { expect, test } from "vitest";
import { runInServerAction } from "vitest-plugin-rsc/nextjs/testing-library";
import { createNote, setLanguage } from "../lib/actions.ts";
import { db } from "../lib/notes.ts";

test("keeps the cookies an action sets", async () => {
  await runInServerAction(() => setLanguage("nl"));

  const language = await runInServerAction(async () => (await cookies()).get("language")?.value);
  expect(language).toBe("nl");
});

test("creates the note and redirects", async () => {
  const formData = new FormData();
  formData.set("title", "Plan the week");

  const error = await runInServerAction(() => createNote(formData)).catch((error) => error);

  expect(isRedirectError(error)).toBe(true);
  expect(db.notes.get("1")?.title).toBe("Plan the week");
});
```

It opens no page, so it's much faster than rendering a form. Some notes:

- After a `redirect()` no page renders. To check where it went, open that URL with `renderServer({ url })`.
- A page that's already open stays open.
- Your function and its result stay in the test. They don't go through Flight.
- Cookies the action sets are kept for the rest of the test. A `cookie` header you pass is used instead of your app's cookies, for this one call.
- With `proxy: true` the call goes through the proxy, and a redirect there rejects the call, since the action never ran.
- Your function can't send a request to your app itself: that request would wait for this one forever. Call your app's code directly instead.
- Like any Server Action, Next logs whatever your function throws with `console.error`.

## The proxy, redirects and rewrites

`proxy.ts` and the `redirects`, `rewrites` and `headers` in `next.config` run too, through Next's own routing package, [`@next/routing`](https://www.npmjs.com/package/@next/routing).

```ts
// proxy.ts
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Sends a visitor without a session elsewhere.
  if (pathname === "/team" && !request.cookies.has("session")) {
    const account = new URL("/account", request.url);
    account.searchParams.set("from", pathname);
    return NextResponse.redirect(account);
  }
  // Serves another route at this URL.
  if (pathname.startsWith("/go/")) {
    return NextResponse.rewrite(new URL(`/docs/${pathname.slice("/go/".length)}`, request.url));
  }
}
```

```tsx
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { handleRequest, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("follows a redirect of the proxy", async () => {
  const response = await handleRequest("/team", { redirect: "manual" });

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("/account?from=%2Fteam");

  await renderServer({ url: "/team" });

  await expect.element(page.getByRole("heading", { name: "Account" })).toBeVisible();
  expect(window.location.pathname + window.location.search).toBe("/account?from=%2Fteam");
});

test("serves the route the proxy rewrites to, at the URL that was asked for", async () => {
  await renderServer({ url: "/go/routing" });

  await expect.element(page.getByRole("heading", { name: "Docs: routing" })).toBeVisible();
  expect(window.location.pathname).toBe("/go/routing");
});
```

Want to skip the proxy? `proxy: false` opens exactly the URL you give, so a protected page opens without signing in:

```tsx
test("opens a page without the proxy", async () => {
  await renderServer({ url: "/team", proxy: false });

  await expect.element(page.getByRole("heading", { name: "Team" })).toBeVisible();
});
```

The page's Server Actions and `router.refresh()` skip the proxy too, but navigating to another route goes through it, like in your app.

Nice bonus: the proxy runs in the same module graph as your test. So `vi.mock()` reaches the modules it imports, and you can mock the session it reads or check what it wrote.

## Mocks

`vi.mock()` replaces modules that your Server Components, Server Actions, route handlers and proxy import. Put mocks in a **setup file**: with `isolate: false`, the test files in a worker share modules, so a mock in one test file would leak into (or miss) the others.

A bare `vi.mock()` is enough:

```ts
// vitest.setup.ts
import { vi } from "vitest";

vi.mock("./app/lib/weather.ts");
```

```ts
// vitest.config.ts
test: {
  setupFiles: ["./vitest.setup.ts"],
}
```

Then each test decides what the mock does:

```tsx
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { getForecast } from "../lib/weather.ts";

test("renders a route with a server module mocked in the setup file", async () => {
  vi.mocked(getForecast).mockResolvedValue("sunny");

  await renderServer({ url: "/forecast" });

  await expect.element(page.getByText("Today: sunny")).toBeVisible();
  expect(getForecast).toHaveBeenCalledOnce();
});
```

Two things `vi.mock()` can't do: reach Client Components in the browser, or run in a `"use client"` test file. For requests to other servers, use [MSW](https://mswjs.io/docs/recipes/vitest-browser-mode) rather than a module mock.

## Fonts, images and styles

Your source files go through Next's own compiler, so all of this works out of the box:

- `next/font/local` and `next/font/google`, with Next's class names and font files.
- `next/image`, including imported images and the image optimizer.
- `next/dynamic`, `next/script`, styled-jsx, global CSS and CSS modules.
- `paths` from your `tsconfig.json`, like `@/components/button`.
- `next build`'s checks. A client hook in a Server Component, or `server-only` code in a Client Component, fails the test with Next's own error.

```tsx
// app/fonts/fonts.ts
import { Inter } from "next/font/google";
import localFont from "next/font/local";

export const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
export const geist = localFont({ src: "./geist-latin.woff2", variable: "--font-geist" });
```

```tsx
import { geist } from "./fonts.ts";

test("sets text in a font of next/font/local, a file of the app", async () => {
  await renderServer({ url: "/fonts" });

  const text = page.getByText("Set in Geist", { exact: true });
  await expect.element(text).toHaveClass(geist.className);
  await expect.element(text).toHaveStyle({ fontFamily: geist.style.fontFamily });
  // Served where Next's build puts it.
  const [face] = await document.fonts.load(`16px ${geist.style.fontFamily}`);
  expect(face?.status).toBe("loaded");
});
```

## Server code in the browser

Your server code runs in the browser, but it's told it runs on a server, the same way Next's build tells it: `typeof window` is `"undefined"`, and `fetch` is Next's patched one. Your test files keep the real `window` and `fetch`. For which Node.js APIs are available, see [Node.js in the browser](nodejs-in-the-browser.md).

If a module really needs to know it's in a browser, list it in `browserModules`:

```ts
// test/browser.ts
export function scrollToTop(): void {
  if (typeof window !== "undefined") window.scrollTo(0, 0);
}
```

```ts
vitestPluginNext({ browserModules: ["test/**"] });
```

The patterns are globs from the project root, matched against real file paths. For a package, start the pattern with `**`, since it rarely lives at `node_modules/<name>` under your root. Details in [`browserModules`](internals/next-routes.md#browsermodules).

### Catch hydration mismatches

A Client Component that renders differently on the server than in the browser fails just like in production: with a hydration mismatch, reported through `console.error`. So it's a good idea to fail tests on any `console.error`, like the playgrounds do:

```ts
let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  expect(consoleError.mock.calls).toEqual([]);
});
```

## Environment variables

Your server code reads `process.env` the way Next's test mode does:

- In a test run: `.env.test.local`, `.env.test` and `.env`.
- In a build: `.env.test` and `.env`.

It never reads `.env.local`, other modes' files, or your shell, unless `env` in `next.config` puts a value in. `NEXT_PUBLIC_` variables and `env` from `next.config` are there too.

> [!WARNING]
> A static build bakes these values into the site. Keep secrets out of `.env.test` and `.env`.

More in [Environment Variables](internals/next-routes.md#environment-variables).

## Test isolation

Vitest runs test files in parallel, each worker in its own browser tab, and each tab has its own server, database, disk, cookies and storage. Workers share nothing, so there's no shared test database to fight over.

Before every test, the plugin:

- empties the in-memory disk and Next's Data Cache,
- opens a fresh browser context for your app: no cookies, empty storage.

A database recipe's setup file also resets the database and fixes the clock with `vi.setSystemTime()`. On Postgres and MySQL, even `now()` follows that clock.

What the plugin _doesn't_ reset is your own module state, like a `Map` in memory or a mock's implementation. Reset that in a `beforeEach()`.

Within one worker, test files run one after another and (with `isolate: false`) share modules, and so the database. The reset before each test keeps them apart.

### No `test.concurrent`

Tests within a file run one at a time. [`test.concurrent`](https://vitest.dev/api/#test-concurrent) doesn't work with anything that reads Next's request context: `headers()`, `cookies()`, `next/cache` and Server Actions. Concurrent tests would see each other's requests. Test files still run in parallel, so you're not losing much.

### Slow first test

Each worker loads Next's runtime before its first test, so that one's slower. With as many workers as CPU cores, it can even time out. The notes demo sets `maxWorkers: 4` to avoid that.

### A faster start, until Vitest has it

At every start, Vitest's mocker parses each pre-bundled dependency that has an `import()` or a `vi.mock(` in its text, to wrap the `import()`s for its mocks: the page loads hundreds of those chunks, Next's and React's, and a database like PGlite is one of 1.8 MB. On CI, skipping them takes 0.27–0.42 s off a one-file run of the notes benchmark of about 4 s, in the medians of 8 rounds on each of four runners. This repository skips them with [`pnpm patch`](https://pnpm.io/cli/patch) (`patches/@vitest__mocker@5.0.5.patch`, applied through `patchedDependencies` in `pnpm-workspace.yaml`), until Vitest has the change. A `vi.mock()` of a dependency still applies, by the module's URL, and the modules inside a chunk can't be mocked one by one either way. What you give up: an `import()` inside a dependency no longer waits for a `vi.doMock()` that is still on its way to the browser, and a `vi.mock()` inside a pre-bundled dependency isn't hoisted.

To use it in your app with pnpm, copy the patch file and add it to your `pnpm-workspace.yaml`, for the version of `@vitest/mocker` that you have:

```yaml
patchedDependencies:
  "@vitest/mocker@5.0.5": patches/@vitest__mocker@5.0.5.patch
```

Then run `pnpm install --config.optimistic-repeat-install=false` once, so that pnpm installs the patched package. The patch is a small helper, `isOptimizedDepFile()`, and a check of it in the transform of both plugins, `vitest:browser:esm-injector` and `vitest:mocks`, in `dist/node.js`. It pins `@vitest/mocker` 5.0.5: on a bump of Vitest, redo it for the new version with `pnpm patch @vitest/mocker`, or drop it once Vitest has the change.

## Development or production

By default, Next and React run their development builds, like `next dev`. Set `vitestPluginNext({ build: "production" })` to run them like `next start`: faster, and without dev warnings. It's still experimental.

Why might you want it? In development, React sends a Server Component's error message to the client, so `error.tsx` can show it. A deployment sends only a digest. So a test that checks such an error message passes here but wouldn't match production. With `build: "production"`, it behaves like a deployment.

See [Development or production](internals/next-routes.md#development-or-production) for everything that changes.

## Fast mode

The plugin runs in one of two modes. Fidelity mode, the default, gives up nothing for speed: a test sees what a browser shows of your app, as CI should run it. Fast mode is for a quick feedback loop, like an agent's or your watch run's. It gives up some of what a test sees of a browser for speed: on a suite of 500 tests that open the routes of a notes app and click through them with Testing Library's `user-event`, a run takes well under half the time on the same machine (2.6× faster in production, 2.2× in development, on one CI runner), and a page without a server-rendered document loads in a few milliseconds instead of tens. It's experimental. Turn it on in the config, or for one run with an environment variable, and keep CI in fidelity mode:

```ts
vitestPluginNext({ mode: "fast" });
```

```bash
VITEST_PLUGIN_RSC_MODE=fast npx vitest
```

Fast mode turns on every speed feature. Each is an option of its own, which defaults to `true` in fast mode and `false` in fidelity mode:

- **One app per test file** (`keepApp`). The first page of a test file starts the app, and every `renderServer({ url })` after it renders its page in that app, from its Flight payload, without loading the page. Each page gets a React tree and a router of its own, so the state of a component doesn't carry over from one test to the next. The state of a module does, as in an app that never reloads: a module that keeps a value from the test before has it in the next one. So does what the code of the app added to the `<head>`, like the stylesheets of the pages before, as after a navigation of the app. The page renders on the client, as with `ssr: false`, and so does a page that the app loads itself from it, like after a `<form>` without a Server Action, so a test doesn't see the server's HTML or a hydration mismatch. A test that asserts on them passes `renderServer({ url, ssr: true })` and gets a page load of its own. In development, the page has no dev overlay.
- **Page loads without a document** (`flightLoads`). A page of the kept app loads with the request Next's router sends for a page, for its Flight payload alone, so the server renders no HTML for it. Its `response` in what `renderServer()` returns is that one: `text/x-component`, not the document. The head has no `<meta name="next-size-adjust">` of `next/font`, and a page that the test leaves while it loads stops rendering on the server: a test of a render that outlives its page passes `ssr: true`. A page whose render throws, like one that calls `redirect()` or `notFound()`, loads as a document after all, with the status and the response of that document. The server then handles that page twice, with the cookies the first response set.
- **No prefetching** (`skipPrefetch`). `<Link>` and `<Form>` don't prefetch.
- **No delay between the steps of a render** (`immediates`). The server doesn't wait the few milliseconds a browser adds to a timeout of `0` between the steps of a render, unless the test fakes the timers.
- **Less waiting for the DOM** (`watchDom`). `expect.element()` looks for an element again on every change of the DOM, and `expect.poll()` every 5 ms, unless your config sets `expect.poll.interval`.
- **One answer of the dev server per test file** (`cacheDevServer`). What the dev server says about the stylesheets and the modules of a test file is asked once per test file, not for every page.
- **Password hashes that cost microseconds** (`fastCrypto`). Password hashes and key derivation of `bcryptjs`, `node:crypto` and Web Crypto cost microseconds, with the same API, so a hash a test makes verifies in the app. See [Fast crypto](nodejs-in-the-browser.md#fast-crypto).

An option you set overrides the mode, in either direction. Fast mode with the real password hashes, and fidelity mode with one speed feature:

```ts
vitestPluginNext({ mode: "fast", fastCrypto: false });
vitestPluginNext({ mode: "fidelity", watchDom: true });
```

A suite that passes in fast mode should pass in fidelity mode too. CI tells you when it doesn't.

## Start sooner on Bun

A run of one test file is mostly startup. [Bun](https://bun.sh) can run Vitest's own process, with Vite and Playwright, while your tests still run in the browser. On the notes app of `playground/vitest-vs-playwright-notes` (where `pnpm test:vitest` runs on Bun), a run of one file took 10.4 s with `pnpm exec vitest run` and 7.6 s with `bun --bun vitest run`; once the tests run, they take the same time. About 1.1 s of that is `pnpm exec` itself, which `./node_modules/.bin/vitest` skips on Node.js too.

```bash
bun --bun vitest run --configLoader native
```

`--configLoader native` has Bun import the config file itself, rather than Vite bundle it first.

Give Bun a dependency cache of its own in your Vitest config. Vite's hash of the config includes its functions as text, which Bun prints differently from Node.js, so each runtime would find the other's cache stale and optimize the dependencies again:

```ts
cacheDir: process.versions.bun ? "node_modules/.vite-bun" : undefined,
```

Vitest is made for Node.js, not Bun, so keep a run on Node.js in CI.

## Watch mode

In watch mode, saving any file of your app reruns every test file that opens a route, plus any test file that imports the saved file.

Why every route test? A test that calls `renderServer({ url })` doesn't import the route's files, so Vitest can't tell which routes it covers. For the same reason, `vitest --changed` and `vitest related` only find tests by their imports. When in doubt, run the route tests or the whole suite. More in [Watch mode](internals/next-routes.md#watch-mode).
