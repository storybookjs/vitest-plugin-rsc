import {
  cleanup,
  handleRequest,
  renderServer,
  runInServerAction,
} from "vitest-plugin-rsc/nextjs/testing-library";
import { cookies } from "next/headers";
import { expect, onTestFinished, test, vi } from "vitest";
import { page } from "vitest/browser";
import { getForecast } from "./lib/weather.ts";

// The app's cookies are the plugin's, as the headers of a request are: a
// `cookie` header of `renderServer()` sets them, a `Set-Cookie` of the server
// or a script of the page sets or deletes them, and every request to the app
// carries them. `document.cookie` is a view of them, as in a browser, and the
// browser's own cookies are not the app's. `cleanup()` forgets them.

// What the server answers a request with, as `Set-Cookie` headers.
async function serverSets(...setCookies: string[]): Promise<void> {
  const response = await handleRequest("/api/cookies", {
    method: "POST",
    body: JSON.stringify(setCookies),
  });
  expect(response.headers.getSetCookie()).toEqual(setCookies);
}

// The cookies that the next request of the app has.
const cookiesOfTheApp = () =>
  runInServerAction(async () =>
    Object.fromEntries((await cookies()).getAll().map(({ name, value }) => [name, value])),
  );

test("sets the cookies of a cookie header, for the document and the requests after it", async () => {
  await renderServer({ url: "/settings", headers: { cookie: "language=nl; editor=kasper" } });

  await expect.element(page.getByText("Language: nl")).toBeVisible();
  expect(await cookiesOfTheApp()).toEqual({ language: "nl", editor: "kasper" });
});

test("gives the next page load the cookie that a Server Action set", async () => {
  await renderServer({ url: "/settings" });
  await page.getByRole("button", { name: "Use Dutch" }).click();
  await expect.element(page.getByText("Language: nl")).toBeVisible();

  await renderServer({ url: "/settings" });

  await expect.element(page.getByText("Language: nl")).toBeVisible();
});

test("gives the next request the cookie that a route handler set", async () => {
  await serverSets("last-created=3; Path=/");

  // It redirects to the note of the `last-created` cookie.
  const response = await handleRequest("/api/notes/latest", { redirect: "manual" });

  expect(response.headers.get("location")).toBe("/notes/3");
});

test("gives the next hop of a redirect the cookie that the redirect set", async () => {
  // A sign-in that sets the session and sends the visitor to their account.
  const signIn = new URLSearchParams({
    status: "303",
    to: "/account",
    cookie: "session=grace; Path=/; HttpOnly",
  });

  const { response } = await renderServer({ url: `/api/redirect?${signIn}` });

  expect(response.redirected).toBe(true);
  await expect.element(page.getByText("Signed in as grace")).toBeVisible();
});

test("sends the cookie header of a request instead of the app's cookies, with that request alone", async () => {
  await serverSets("language=nl", "editor=kasper");

  const sent = async (cookie: string) =>
    (await (await handleRequest("/api/cookies", { headers: { cookie } })).json()).cookie;
  expect(await sent("editor=grace")).toBe("editor=grace");
  expect(await sent("")).toBe("");

  // The app's cookies are as they were.
  expect(await cookiesOfTheApp()).toEqual({ language: "nl", editor: "kasper" });
});

test("sends the cookie header of a Server Action instead of the app's cookies, with that request alone", async () => {
  await serverSets("language=nl");

  const seen = await runInServerAction(
    async () => (await cookies()).getAll().map(({ name, value }) => `${name}=${value}`),
    { headers: { cookie: "editor=grace" } },
  );

  expect(seen).toEqual(["editor=grace"]);
  expect(await cookiesOfTheApp()).toEqual({ language: "nl" });
});

test("sends the cookie header of a request with its redirects, with the cookies they set", async () => {
  await serverSets("language=nl");
  // A sign-in that replaces the session and sends the visitor on.
  const signIn = new URLSearchParams({ status: "303", to: "/api/cookies", cookie: "session=new" });

  const response = await handleRequest(`/api/redirect?${signIn}`, {
    method: "POST",
    headers: { cookie: "editor=grace; session=stale" },
  });

  expect(response.redirected).toBe(true);
  expect((await response.json()).cookie).toBe("editor=grace; session=new");
  expect(await cookiesOfTheApp()).toEqual({ language: "nl", session: "new" });
});

test("keeps the cookie header of a request on a redirect of Next's own", async () => {
  // Next redirects a path with a trailing slash, and the proxy sends a
  // visitor without a session from `/team` to `/account`.
  const response = await handleRequest("/team/", { headers: { cookie: "session=ada" } });

  expect(response.redirected).toBe(true);
  expect(new URL(response.url).pathname).toBe("/team");
});

test("drops the cookie header of a fetch of the page, as a browser does", async () => {
  await serverSets("language=nl");

  const response = await fetch("/api/cookies", { headers: { cookie: "editor=grace" } });

  expect((await response.json()).cookie).toBe("language=nl");
});

test("sends and keeps no cookies with a request that omits its credentials", async () => {
  await serverSets("language=nl");

  const sent = await fetch("/api/cookies", { credentials: "omit" });
  expect((await sent.json()).cookie).toBeNull();
  const handled = await handleRequest("/api/cookies", { credentials: "omit" });
  expect((await handled.json()).cookie).toBeNull();
  const fetched = await fetch("/api/cookies", {
    method: "POST",
    credentials: "omit",
    body: JSON.stringify(["theme=dark"]),
  });
  expect(fetched.status).toBe(204);
  const posted = await handleRequest("/api/cookies", {
    method: "POST",
    credentials: "omit",
    body: JSON.stringify(["editor=grace"]),
  });
  expect(posted.headers.getSetCookie()).toEqual(["editor=grace"]);

  expect(await cookiesOfTheApp()).toEqual({ language: "nl" });
});

test("keeps the cookies that a request with a cookie header of its own gets", async () => {
  const response = await handleRequest("/api/cookies", {
    method: "POST",
    headers: { cookie: "editor=grace" },
    body: JSON.stringify(["theme=dark"]),
  });

  expect(response.headers.getSetCookie()).toEqual(["theme=dark"]);
  expect(await cookiesOfTheApp()).toEqual({ theme: "dark" });
});

test("hides the Set-Cookie headers of a response from the page, as a browser does", async () => {
  // Redirected, so the response has a URL of its own to keep.
  const response = await fetch("/api/redirect?status=307&to=/api/cookies", {
    method: "POST",
    body: JSON.stringify(["session=grace; Path=/; HttpOnly", "theme=dark; Path=/"]),
  });

  expect(response.status).toBe(204);
  expect(response.redirected).toBe(true);
  expect(response.url).toBe(`${location.origin}/api/cookies`);
  expect(response.headers.getSetCookie()).toEqual([]);
  // The app has them all the same: the next request carries them.
  expect(await cookiesOfTheApp()).toEqual({ session: "grace", theme: "dark" });
});

test("deletes a cookie that the server expires", async () => {
  await serverSets("a=1", "b=2", "c=3", "d=4");

  await serverSets("a=; Max-Age=0", "b=; Expires=Thu, 01 Jan 1970 00:00:00 GMT", "d=5; Max-Age=60");
  expect(await cookiesOfTheApp()).toEqual({ c: "3", d: "5" });

  // Next expires it.
  await runInServerAction(async () => (await cookies()).delete("c"));
  expect(await cookiesOfTheApp()).toEqual({ d: "5" });
});

test("keeps a cookie by its name, whatever its path and domain", async () => {
  await serverSets("admin=1; Path=/admin", "team=core; Domain=example.com; Secure");

  expect(await cookiesOfTheApp()).toEqual({ admin: "1", team: "core" });
});

test("shows a script of the page the cookies that are not HttpOnly, also the Secure ones", async () => {
  await serverSets("session=grace; Path=/; HttpOnly; Secure", "theme=dark; Path=/; Secure");

  await renderServer({ url: "/account" });

  await expect.element(page.getByText("Signed in as grace")).toBeVisible();
  expect(document.cookie).toBe("theme=dark");
});

test("keeps a script of the page from writing an HttpOnly cookie, or changing one", async () => {
  await serverSets("session=grace; Path=/; HttpOnly");

  document.cookie = "session=mallory; path=/";
  document.cookie = "admin=1; path=/; HttpOnly";

  expect(await cookiesOfTheApp()).toEqual({ session: "grace" });
});

test("gives the server the cookie that a script of the page writes", async () => {
  await renderServer({ url: "/inbox" });
  await expect.element(page.getByText("Rendered with the sidebar open")).toBeVisible();

  await page.getByRole("button", { name: "Close sidebar" }).click();
  expect(document.cookie).toBe("sidebar_state=false");
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect.element(page.getByText("Rendered with the sidebar closed")).toBeVisible();

  // And the next page load.
  await renderServer({ url: "/inbox" });
  await expect.element(page.getByText("Rendered with the sidebar closed")).toBeVisible();
  await expect.element(page.getByRole("button", { name: "Open sidebar" })).toBeVisible();
});

test("gives the page no Cookie Store API, which would be the browser's own cookies", () => {
  expect("cookieStore" in window).toBe(false);
  expect("CookieStore" in window).toBe(false);
  expect("CookieChangeEvent" in window).toBe(false);
});

test("forgets the app's cookies in cleanup()", async () => {
  await serverSets("a=1");

  await cleanup();

  expect(document.cookie).toBe("");
  expect(await cookiesOfTheApp()).toEqual({});
});

test("keeps the cookies of a response that comes after its test out of the next test", async () => {
  // A request whose body is sent after the test has ended, so the server
  // answers it after that.
  let send!: () => void;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      send = () => {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(["late=1"])));
        controller.close();
      };
    },
  });
  const answered = fetch("/api/cookies", { method: "POST", body, duplex: "half" } as RequestInit);

  // What ends a test.
  await cleanup();
  send();

  expect((await answered).status).toBe(204);
  expect(await cookiesOfTheApp()).toEqual({});
});

test("leaves the browser's own cookies alone, and out of the app", async () => {
  // The cookies of the tab, which other documents of the origin share, like
  // Vitest's UI or another app on localhost.
  const tab = Object.getOwnPropertyDescriptor(Document.prototype, "cookie")!;
  const tabCookie = () => tab.get!.call(document) as string;
  tab.set!.call(document, "runner=1; path=/");
  onTestFinished(() => tab.set!.call(document, "runner=; path=/; max-age=0"));

  await serverSets("a=1");
  document.cookie = "b=2";

  expect(document.cookie).toBe("a=1; b=2");
  expect(await cookiesOfTheApp()).toEqual({ a: "1", b: "2" });
  expect(tabCookie()).toBe("runner=1");
  await cleanup();
  expect(tabCookie()).toBe("runner=1");
});

test("shares the cookies between requests of a page that overlap", async () => {
  let resolveForecast!: (forecast: string) => void;
  vi.mocked(getForecast).mockReturnValueOnce(new Promise((resolve) => (resolveForecast = resolve)));
  await renderServer({ url: "/settings" });

  // A request of the page that streams: the rest of its body comes once the
  // service answers.
  const forecast = await fetch("/api/forecast");
  const reader = forecast.body!.pipeThrough(new TextDecoderStream()).getReader();
  expect(await reader.read()).toEqual({ done: false, value: "Today: " });

  // A Server Action that sets a cookie, sent meanwhile. The server handles it
  // once the response before it has ended.
  const sent = vi.spyOn(globalThis, "fetch");
  onTestFinished(() => sent.mockRestore());
  await page.getByRole("button", { name: "Use Dutch" }).click();
  await expect
    .poll(() => sent.mock.calls.some(([, init]) => new Headers(init?.headers).has("next-action")))
    .toBe(true);
  resolveForecast("sunny");
  expect(await reader.read()).toEqual({ done: false, value: "sunny" });
  await expect.element(page.getByText("Language: nl")).toBeVisible();

  await renderServer({ url: "/settings" });

  await expect.element(page.getByText("Language: nl")).toBeVisible();
});
