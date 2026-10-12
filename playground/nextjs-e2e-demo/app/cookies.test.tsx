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
// `cookie` header of the test sets them, a `Set-Cookie` of the server sets or
// deletes them, and every request to the app carries them. They are not in
// `document.cookie`, and `cleanup()` forgets them.

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

test("adds the cookies of a cookie header to the ones the app has, for the rest of the test", async () => {
  await serverSets("language=nl", "editor=kasper");

  await handleRequest("/api/echo/a", { headers: { cookie: "editor=grace; theme=dark" } });

  // Not for that one request: the requests after it have them too.
  expect(await cookiesOfTheApp()).toEqual({ language: "nl", editor: "grace", theme: "dark" });
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

test("gives the server an HttpOnly cookie, and the page none of the app's cookies", async () => {
  await serverSets("session=grace; Path=/; HttpOnly", "theme=dark; Path=/");

  await renderServer({ url: "/account" });

  await expect.element(page.getByText("Signed in as grace")).toBeVisible();
  expect(document.cookie).not.toMatch(/session|theme/);
});

test("forgets the app's cookies in cleanup()", async () => {
  await serverSets("a=1");

  await cleanup();

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

test("leaves the cookies of the tab alone", async () => {
  document.cookie = "runner=1; path=/";
  onTestFinished(() => {
    document.cookie = "runner=; path=/; max-age=0";
  });

  await serverSets("a=1");
  // Not the tab's.
  expect(await cookiesOfTheApp()).toEqual({ a: "1" });
  await cleanup();

  expect(document.cookie).toContain("runner=1");
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
