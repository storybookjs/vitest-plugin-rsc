# Testing a Next.js app

This guide shows what you can test with `vitest-plugin-rsc/nextjs/testing-library`, and how. It assumes the setup from the [quick start](../README.md#quick-start). For what happens under the hood, see [Next.js: How It Works](next-routes.md). Every function and option is listed in the [API reference](api.md).

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

Client Components that only take props, like the parts of a design system, can also be tested on their own, without Next: see [Testing Client Components in a `"use client"` test file](use-client-test-files.md).

## Render a component

Pass a node to `renderServer` to test one component instead of a whole page:

```tsx
await renderServer(<CreateNoteForm />);
```

It renders the way Testing Library renders a component: in a `<div>` container in `document.body`, without your app's layouts. Everything around it is still Next, though: the request, the cookies, Server Actions, the cache and the router.

Without a `url`, the node renders at `/`. With a `url`, the pathname, search params and route params come from it, with the params that your app's route has for that URL. The request goes straight to your route and skips `proxy.ts`, so a component that sits behind a sign-in renders without one.

The node lives in the test's page, not in a page of your app. So a component that reloads the page reloads the test's tab, just as it would without the plugin: one that calls `location.reload()`, for example, or one that navigates to its own URL, like a `<form method="get">` without an `action`.

### Wrap it in providers

`wrapper` wraps the node on the server, to give it the providers that a layout would. It can be a Server Component:

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

`layouts: true` renders the node inside your app's layouts for that `url`, with everything they give it: providers, global CSS and the data a layout reads.

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

Without `layouts`, a node only has the CSS that its test file and the setup files import. To get your root layout's global CSS there too, import it in a setup file.

### How much of the app is around it

Two options decide how much of your app surrounds what you render. `proxy` runs `proxy.ts`, together with the redirects, rewrites and headers in `next.config`, and `layouts` renders your layouts. Their defaults:

|                                   | `proxy` | `layouts` |
| --------------------------------- | ------- | --------- |
| `renderServer({ url })`           | `true`  | `true`    |
| `renderServer(<Node />, { url })` | `false` | `false`   |

For a node, you can set both per test. A route always renders inside its layouts, but you can turn its `proxy` off. For example, to render a component inside its route's layouts, behind the proxy that guards it:

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

To render a node again with other props, without a page load, use `rerender()`: see the [API reference](api.md#rerenderui).

## Open a whole route

`renderServer({ url })` opens a route the way a browser does. The request goes to Next's request handler, the browser shows the HTML it sends back, and Next's client code hydrates it. `renderServer` resolves once the page has hydrated. From then on, Next's router is in charge, so links, forms and redirects behave as they do in your app.

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

The plugin shows a page once its whole document has arrived, so a page's first load doesn't show a `loading.tsx` or a Suspense fallback. A navigation inside the app does.

`renderServer` resolves with `{ response, errors, unmount }`: the server's `Response` to the document request, the errors React reported on the page, and a function that leaves the page.

```tsx
const { response } = await renderServer({ url: "/" });

expect(response.status).toBe(200);
```

The `headers` you pass are sent with the request, and with every later request from the page. A `cookie` header sets cookies for your app (see [Headers and cookies](#headers-and-cookies)):

```tsx
test("sends the cookies of a cookie header with the page", async () => {
  await renderServer({ url: "/notes", headers: { cookie: "last-created=7" } });

  await expect.element(page.getByText("Last created: 7")).toBeVisible();
});
```

A URL that isn't a route gets your app's not-found page, with status `404`.

## Forms and Server Actions

This example tests a full `page.tsx` route, but the same pattern works for any component, form or flow.

The page is a Server Component with a Server Action. On a validation error, the action writes the message to a cookie and calls `refresh()`:

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

The test seeds both server-side state (the signed-in user and a database row) and browser-side state (`localStorage`). Then it renders the page, uses the form, and asserts on the rerendered UI:

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

A pure unit test can't set server and browser state in the same setup, and a full E2E test can only do it through the real UI.

In the setup file, `vi.mock("#lib/db.ts")` replaces the production database adapter with the `__mocks__` version next to it (`lib/__mocks__/db.ts`). The mock exports `db`, backed by an in-memory PGlite database, and `resetDb()`, which empties every table. The setup file calls `resetDb()` before each test. See [Databases](databases.md) for how the recipes wire this up.

## Router hooks and links

Pass a `url` when a component needs to know where it is: `usePathname`, `useSearchParams`, `useParams`, `next/link`, or code that depends on the request URL. The params come from your app's route for that URL. A Client Component uses the normal Next APIs:

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

Navigating to another route of your app opens that page with its layouts, just as a click in the browser does.

## Headers and cookies

Headers and cookies belong to the request and live in `AsyncLocalStorage`, as in Next. Pass request headers to `renderServer`, and use Next's `headers()` and `cookies()` in Server Components, Server Actions, route handlers and `proxy.ts` as you normally would. Next creates its request store for every request the plugin sends it, as it does on a server.

The headers you pass go with every request the browser sends to your app from then on, not only the first one. Server Actions, `router.refresh()`, navigations and `fetch` calls get them too, until the test opens something else or ends. That's what you want for a header that a server in front of your app adds to every request, like `x-forwarded-for`. A request keeps the headers it sets itself, and an `accept` header only applies to the first request.

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

### How cookies work

The plugin keeps your app's cookies for the test, the way a browser keeps a site's cookies:

- **A `cookie` header** in the `headers` of `renderServer` sets cookies, as a `Set-Cookie` without attributes would. They're added to the cookies your app already has, and they stay until your app changes them or the test ends. They aren't `HttpOnly`, so `document.cookie` shows them. To set an `HttpOnly` cookie, call `(await cookies()).set(name, value, { httpOnly: true })` in `runInServerAction`.
- **Every request to your app carries them**: page loads, navigations, `router.refresh()`, Server Actions, route handlers, and `fetch` calls from Client Components.
- **A `Set-Cookie` from your server** sets a cookie, and one that has expired (with `Max-Age=0` or an `Expires` in the past) deletes it. A cookie is only a name and a value. Its `Path`, `Domain` and `Secure` don't matter, since every request goes to your app, as if it were served over `https:`.
- **A `cookie` header passed to `handleRequest` or `runInServerAction`** applies to that one request, and is sent instead of your app's cookies. It's also sent with the redirects that `handleRequest` follows, together with the cookies those redirects set. The cookies the server sets become your app's cookies from then on.
- **A request with `credentials: "omit"`**, from `fetch` or `handleRequest`, doesn't send your app's cookies, and the cookies its response sets aren't kept.
- **Each test starts without cookies.**

`document.cookie` is a view of your app's cookies, as in a browser:

- Your Client Components can read the cookies that aren't `HttpOnly` there. A cookie they write there reaches your server, like the state that shadcn/ui's sidebar keeps.
- A script can't write or change an `HttpOnly` cookie, and a `fetch` from client code doesn't see a `Set-Cookie` header, just as in a browser.
- The page has no `cookieStore`, like a browser without the Cookie Store API.
- MSW writes the `Set-Cookie` of a response it mocks into `document.cookie`. So a mocked API's cookie that isn't `HttpOnly` becomes your app's cookie, even when your server sent the request.

The browser's own cookies for the origin are not your app's cookies. Those are the cookies that Vitest's UI, another host or another app on `localhost` set. Your app doesn't get them, and the plugin leaves them alone.

### Reading and changing cookies in a test

To read a cookie, assert on what a page renders, read the `Set-Cookie` headers of a response, read `document.cookie` (for a cookie that isn't `HttpOnly`), or call `cookies()` in a Server Action:

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

To change or delete a single cookie in the middle of a test, do what a Server Action would do:

```ts
await runInServerAction(async () => (await cookies()).delete("session"));
```

## localStorage and sessionStorage

`localStorage` and `sessionStorage` belong to your app too, just like its cookies. Each is a `Storage` object from the plugin, not the browser's storage for the origin.

- Every test in a file without `"use client"` gets its own browser context for your app, like a new Playwright context, from before its `beforeEach()` hooks until it ends. So each test starts with both storages empty, apart from what the test or a `beforeEach()` writes there.
- What your app stores stays in the test's document. No other document of the origin sees it, and your app sees nothing that another document stores.
- Your app hears the browser's `storage` events, which are about the host's storage, never its own.
- Each storage is one object for as long as the document lives. So a library that grabbed `localStorage` in one context, like one that a page loads, sees the items of the test that's currently running.
- A `beforeAll()` or the top level of a test file runs outside a context. What it writes to `localStorage` or `document.cookie` belongs to the origin, and stays there. Seed in a `beforeEach()` instead.
- Spy on `fetch` in the test or in a `beforeEach()`. A spy set up before the context opens sits under the context's `fetch`, and only sees the requests that aren't your app's.
- The browser's DevTools and Playwright's `storageState()` show the browser's storage, not your app's.
- A spy on `Storage.prototype` sees none of your app's calls. Spy on `localStorage` instead.

See [Web Storage](next-routes.md#web-storage) for what else differs.

## Caching and revalidation

Server Components can use tagged, cached `fetch` calls, and Server Actions can refresh the current tree or invalidate those tags. In tests, [MSW](https://mswjs.io/docs/recipes/vitest-browser-mode) intercepts the outgoing `fetch`. See [`playground/nextjs-notes-demo`](../playground/nextjs-notes-demo) for a worked setup.

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

The test still looks like a unit test. After the click, `updateTag("notes")` invalidates the cached fetch, the panel renders again, and the assertion sees the new count:

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

In an app with `cacheComponents` in its `next.config`, a function with `"use cache"` is cached too. That can be a function, a component, or every function of a module with the directive at its top. You can call `cacheTag()` and `cacheLife()` in it, also after an `await`. This one is from `playground/nextjs-cache-components-demo`:

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

A cached function has a scope of its own, as in a deployment: `cookies()` throws in it, and in any component it renders. A cached component that it renders adds its tags to its entry. With Cache Components, Cached Navigations is off and nothing is prerendered, so a page that reads the request outside a `<Suspense>` boundary still renders. See [Caching](next-routes.md#caching) for the details.

## Route handlers

`handleRequest(url, init)` sends one request to your app and resolves with the response. It takes the same arguments as `fetch`. Use it when you want to assert on the response itself: a status, a header, the HTML or the Flight payload.

- The request carries your app's cookies, and the cookies the server sets become your app's cookies from then on.
- A `cookie` header is sent instead of your app's cookies, with this request and with the redirects it follows.
- The request also carries the `headers` of whatever `renderServer` opened, under its own headers, so a header it sets itself wins.

Route handlers (`app/**/route.ts`) are served too, and `handleRequest` is how a test calls one:

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

A `fetch` from a Client Component to a route handler reaches it too, with your app's cookies. As in a browser, that `fetch` doesn't see the response's `Set-Cookie` headers, but `handleRequest` does.

## Code that a Server Action calls

A form's Server Action is best tested through its page: fill in the form and submit it. For the code that a Server Action calls, use `runInServerAction(fn, { url })`. It runs a function as a Server Action of the page at `url`, inside the action's request, so you can set `cookies()` there, and `redirect()`, `refresh()` and `after()` work. It resolves with what the function returns, and rejects with what it throws, including the error of a `redirect()` or a `notFound()`:

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

It sends a Server Action request like the one Next's router sends, to a route at `url` that renders nothing. It opens no page and starts no app, so it's much faster than a page with a form.

- After a `redirect()`, the call rejects with its error, and no page renders. To check the page the action redirects to, open it in your test with `renderServer({ url })` or `handleRequest()`.
- A page that's already open stays open.
- The function and its result belong to the test, so they don't go through Flight.

The request carries your app's cookies, the `headers` of whatever `renderServer()` opened, and the headers you pass. The cookies the action sets become your app's cookies from then on. A `cookie` header among those headers is sent instead of your app's cookies, with this request only, not with later ones. With `proxy: true`, the request goes through the proxy, and a redirect there makes the call reject, since the action didn't run.

The function runs inside the action's request, so it can't send a request to your app itself: that request would wait for this one. Call your app's code directly instead. Next also reports whatever the function throws with `console.error`, as it does for any Server Action.

## The proxy, redirects and rewrites

`proxy.ts` and the `redirects`, `rewrites` and `headers` in `next.config` run here too, through Next's own route resolution, [`@next/routing`](https://www.npmjs.com/package/@next/routing).

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

`proxy: false` opens the route at exactly the URL you give, without the proxy and without the redirects, rewrites and headers in `next.config`. So a protected page opens without signing in first:

```tsx
test("opens a page without the proxy", async () => {
  await renderServer({ url: "/team", proxy: false });

  await expect.element(page.getByRole("heading", { name: "Team" })).toBeVisible();
});
```

The page's Server Actions and `router.refresh()` skip the proxy too, but a navigation to another route goes through it, as in your app. A node skips the proxy by default: see [Render a component](#render-a-component).

The proxy runs in the test runtime, in the same modules as the test. So a module it imports is the same instance the test imports, and `vi.mock()` replaces it for both. You can mock the session it reads, or assert on what it wrote.

See [The Server In Front Of The App](next-routes.md#the-server-in-front-of-the-app) for how this works.

## Mocks

`vi.mock()` replaces the module that your Server Components, Server Actions and route handlers import. It doesn't reach a Client Component in the browser, and a test file with `"use client"` can't call it. Put mocks of your app's modules in a setup file. With `isolate: false`, the test files in a worker share their modules, so a module is mocked for all of them or for none, and whichever file loads it first decides. A setup file runs before every test file, so every file sees the same mocks.

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

Each test then says what the mock does, through `vi.mocked()`:

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

For requests to other servers, use [MSW](https://mswjs.io/docs/recipes/vitest-browser-mode) rather than a module mock.

## Fonts, images and styles

Next's own compiler compiles your app's source files, in each of Next's three layers:

- **`next/font/local` and `next/font/google`**, with the class names and font files that Next generates.
- **`next/image`**, including imported images and Next's image optimizer.
- **`next/dynamic`**, **`next/script`**, **styled-jsx**, global CSS, and CSS modules.
- **`next build`'s checks**: a client hook in a Server Component, or `server-only` code in a Client Component, fails the test with Next's error.
- **`paths`** from your `tsconfig.json`, like `@/components/button`.

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

The server runs in the browser, but your server code is told it runs on a server, the way Next's build tells it: `typeof window` is `"undefined"`, and `fetch` is the one that Next patches. Test files keep the browser's `window` and `fetch`. For what server code gets in place of Node.js, see [Node.js in the browser](nodejs-in-the-browser.md).

If a module needs to know that it runs in a browser, list it in `browserModules`:

```ts
// test/browser.ts
export function scrollToTop(): void {
  if (typeof window !== "undefined") window.scrollTo(0, 0);
}
```

```ts
vitestPluginNext({ browserModules: ["test/**"] });
```

The patterns are globs relative to the project root. Files are matched by their real path, which for a package is seldom `node_modules/<name>` under the root, so start a pattern for a package with `**`. See [`browserModules`](next-routes.md#browsermodules).

A Client Component that renders something different on the server than in the browser fails the way it does in production, with a hydration mismatch. React reports the mismatch with `console.error`, so it's worth failing tests on any `console.error`, as the playgrounds do:

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

Your app's server code reads `process.env` from the project's test env, the way Next's test mode reads it: `.env.test.local`, `.env.test` and `.env` in a test run, and `.env.test` and `.env` in a build. It never reads `.env.local`, another mode's file, or a value from the shell, unless `env` in `next.config` puts it in. `NEXT_PUBLIC_` variables and `env` from `next.config` are in `process.env` too. A build puts the values into the site, so keep secrets out of `.env.test` and `.env`. See [Environment Variables](next-routes.md#environment-variables).

## Test isolation

Vitest runs test files in parallel, each worker in a browser tab of its own, and each tab has its own server, database, disk, cookies and storage. So workers share nothing, and you don't need a shared test database.

Before each test, the plugin empties the in-memory disk and Next's Data Cache, and opens a new browser context for your app: none of its cookies, and empty `localStorage` and `sessionStorage`. A test file with `"use client"` has the browser's own cookies and storage instead, as with Testing Library. A database recipe's setup file puts the database back to what its migrations made, and fixes the clock with `vi.setSystemTime()`. On Postgres and MySQL, the database's `now()` follows that clock.

### `isolate: false`

By default, Vitest starts every test file in a new iframe, which loads Next's runtime for three layers again: about 0.6 to 1.4 s per test file in the playgrounds. With `isolate: false`, the test files of a worker run one after another in the same iframe. They share its modules, so the runtime loads once per worker, and they share its database, so the reset before each test is what keeps them apart.

The plugin does a lot of work so that this works. Every `renderServer()` is a page load in the same document, and leaving a page is the plugin's job, not the browser's:

- Every page gets a module graph of its own for the browser layer. React, Next's router and your Client Components are evaluated again for it, and once the page is left, nothing keeps them.
- Leaving a page takes back what React and Next.js left behind:
  - React's root, and its listeners;
  - the properties React DOM keeps on the document;
  - the timers, animation frames, message ports, performance observers and listeners on `window` and `document` of Next's code and of the React it ships;
  - the globals that Next's client and React's inline scripts set on `window`;
  - React DOM's properties on the page's nodes, so a node that outlives the page doesn't keep it;
  - the page's nodes, attributes, URL and history entry, and the Flight payload.
- A new browser context and an empty disk before each test, as above.

What React and Next.js still leave behind is listed in [Not Yet](next-routes.md#not-yet), and [page-lifecycle-risk.md](page-lifecycle-risk.md) measures it.

### Avoiding isolation bugs

What the plugin doesn't take back is what your own code and its libraries leave behind, as in any test setup. With `isolate: false` it stays for the test files after it. If you want the speed, a few habits keep the files apart:

- **Mock in a setup file.** The test files of a worker share their modules, so a mock is for all of them, or for none. See [Mocks](#mocks).
- **Reset the state of your own modules in a `beforeEach()`**, like a `Map` in memory or a mock's implementation. The plugin doesn't.
- **Clean up in your effects.** A listener on `window`, an interval or an observer that an effect never removes keeps its whole page in memory, as in an app that never reloads: 0.5 to 2.8 MB a page in the playgrounds.
- **Keep the elements of a page in the test that uses them.** One in a variable of the test file, or in the calls of a mock that is never cleared, keeps its page.
- **Wait for a page that the app loads itself**, like after a link without Next's router, with an `expect.element()` on that page before the test ends.
- **Leave out a library's options that start timers you don't need**, as below.
- **Use `isolate: true` for the test files that still need it.** Put them in a Vitest project of their own, and the rest keeps the speed.

### A timer that outlives its page

Leaving a page takes back what React and Next.js left behind, but not the timers of your app or of its libraries. A browser drops those with the page. Here a timer that is due after its test has ended fires during the next test, and if it touches its page, it throws there. Vitest reports the error under whichever test is running.

`next-themes` with `disableTransitionOnChange` is one. As it mounts, and at every change of theme, it adds a style that turns off transitions, and removes it again 1 ms later. In the notes demo, ten page loads in a row threw 36 errors that way.

Ways out, the first one first:

- **Don't ask for the timer.** For a library, that is often an option. `disableTransitionOnChange` exists so that a change of theme doesn't animate, which a test doesn't need. Turn off motion for the whole app in the setup file instead, with a stylesheet:

  ```ts
  const noMotion = document.createElement("style");
  noMotion.textContent = `
    *, *::before, *::after {
      animation: none !important;
      transition-property: none !important;
    }
  `;
  document.head.append(noMotion);
  ```

  A stylesheet that is in the document before a page loads stays there for every page. Your stories keep their motion: Storybook doesn't run this setup file.

- **Wait for it.** Where the timer is needed, a test that ends right after the app loaded a page itself, like the page a link goes to, can wait for the page to hydrate, and then until the timer is due, before it ends.

Vitest's fake timers can run such a timer too, but they fake the timers of the whole tab: of your app, its server code, Next.js and libraries like PGlite. That has costs of its own, and isn't recommended here.

### No `test.concurrent`

The tests in a file run one after another. [`test.concurrent`](https://vitest.dev/api/#test-concurrent) doesn't work for tests that read `AsyncLocalStorage`, and that includes anything that touches Next.js App Router internals: `headers()`, `cookies()`, `next/cache` and Server Actions. The plugin's `AsyncLocalStorage` runs one request at a time, so concurrent tests would leak context into each other. Sequential tests within a file are fine, and test files still run in parallel.

### Slow first test

Next's runtime loads for all three layers before the first test of a file, or with `isolate: false` before the first test of a worker, so that test is slower. With as many workers as cores, it can time out: `playground/nextjs-notes-demo` sets `maxWorkers: 4` for that.

## Development or production

By default, Next's runtime and React run their development builds, as with `next dev`. `vitestPluginNext({ build: "production" })` runs them as `next start` does after `next build`: faster, and without their warnings. It's experimental. See [development or production](next-routes.md#development-or-production) in the internals for what changes.

The development build has a catch. Next takes itself to be a production server, but React's development build sends the client the message of an error that a Server Component throws, so `error.tsx` can show it. A deployment sends a digest and a message that says nothing. So a test that reads the text of such an error passes here, but not against a deployment. With `build: "production"`, both behave as in a deployment.

## Watch mode

A test that opens a route with `renderServer({ url })` doesn't import the route's files, so Vitest can't tell which routes a test file covers. In watch mode, saving a file of your app reruns every test file that opens a route, and saving a file that a test file imports itself reruns that test file too.

`vitest --changed` and `vitest related` pick test files from Vitest's own import graph, so they find a test file by what it imports, not by the routes it opens. To be sure a change to a route is tested, run the test files that open routes, or the whole suite. See [watch mode](next-routes.md#watch-mode) in the internals.
