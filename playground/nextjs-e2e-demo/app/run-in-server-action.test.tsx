import {
  handleRequest,
  renderServer,
  runInServerAction,
} from "vitest-plugin-rsc/nextjs/testing-library";
import { cookies, headers } from "next/headers";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { beforeEach, expect, onTestFinished, test, vi } from "vitest";
import { page } from "vitest/browser";
import { audit, auditLog } from "./lib/audit.ts";
import { createNote, setLanguage, signIn, toggleFavorite } from "./lib/actions.ts";
import { db } from "./lib/notes.ts";

beforeEach(() => {
  db.notes.clear();
  auditLog.length = 0;
});

test("runs a function as a Server Action, and resolves with what it returns", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "" });

  await expect(runInServerAction(() => toggleFavorite("1"))).resolves.toBe(true);
  expect(db.notes.get("1")?.favorite).toBe(true);
});

test("rejects with what the function throws", async () => {
  await expect(runInServerAction(() => toggleFavorite("404"))).rejects.toThrow("No note 404");
});

// What the next request of the app has of a cookie.
const cookieOfTheApp = (name: string) =>
  runInServerAction(async () => (await cookies()).get(name)?.value);

test("keeps the cookies the action sets for the requests after it", async () => {
  await runInServerAction(() => setLanguage("nl"));

  expect(await cookieOfTheApp("language")).toBe("nl");
  expect(await (await handleRequest("/settings")).text()).toMatch(/Language: (<!-- -->)?nl/);
});

test("sends the app's cookies and the headers it is given", async () => {
  const seen = await runInServerAction(
    async () => ({
      language: (await cookies()).get("language")?.value,
      client: (await headers()).get("x-client"),
    }),
    { headers: { "x-client": "vitest", cookie: "language=nl" } },
  );

  expect(seen).toEqual({ language: "nl", client: "vitest" });
});

test("rejects with the error of a redirect(), which Next has acted on", async () => {
  const error = await runInServerAction(() => {
    const formData = new FormData();
    formData.set("title", "Plan the week");
    return createNote(formData);
  }).catch((error: unknown) => error);

  expect(isRedirectError(error)).toBe(true);
  // NEXT_REDIRECT;<type>;<url>;<status>;
  expect(error).toMatchObject({ digest: expect.stringContaining(";/notes/1;") });
  expect(db.notes.get("1")?.title).toBe("Plan the week");
  expect(await cookieOfTheApp("last-created")).toBe("1");
});

test("renders no page after a redirect(): the test opens that page itself", async () => {
  // Next takes the empty answer for the page as its own fallback, not an error.
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  onTestFinished(() => consoleError.mockRestore());
  const error = await runInServerAction(async () => {
    await signIn("ada");
    redirect("/welcome");
  }).catch((error: unknown) => error);
  expect(isRedirectError(error)).toBe(true);
  // Next's router would show the page now: nothing here does, so Next has
  // not rendered it, also not on its own after the action.
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(auditLog).toEqual([]);

  // The page renders once, in the request that opens it, with the cookies
  // of the action.
  expect(await (await handleRequest("/welcome")).text()).toContain("Welcome");
  expect(auditLog).toEqual(["welcomed ada"]);
  expect(consoleError).not.toHaveBeenCalled();
});

test("rejects with what notFound() throws", async () => {
  const error = await runInServerAction(() => notFound()).catch((error: unknown) => error);

  expect(error).toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
});

test("rejects when the proxy redirects, as the action did not run", async () => {
  await expect(
    runInServerAction(() => setLanguage("nl"), { url: "/team", proxy: true }),
  ).rejects.toThrow(/did not run: .*\/team redirected to .*\/account\?from=%2Fteam/);
  expect(await cookieOfTheApp("language")).toBeUndefined();
});

test("goes through the proxy with `proxy`, like a page", async () => {
  const teamHeader = async () => (await headers()).get("x-team");

  const signedIn = { cookie: "session=ada" };

  await expect(
    runInServerAction(teamHeader, { url: "/team", headers: signedIn }),
  ).resolves.toBeNull();
  await expect(
    runInServerAction(teamHeader, { url: "/team", proxy: true, headers: signedIn }),
  ).resolves.toBe("core");
});

test("runs what the action leaves for after() once it has responded", async () => {
  await runInServerAction(() => {
    after(() => audit("after the action"));
  });

  await expect.poll(() => auditLog).toEqual(["after the action"]);
});

test("runs calls at the same time, each its own function", async () => {
  await expect(
    Promise.all([runInServerAction(() => "first"), runInServerAction(() => "second")]),
  ).resolves.toEqual(["first", "second"]);
});

test("lets a call finish what it does after its response, also when another call follows", async () => {
  await runInServerAction(
    () => {
      after(async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        audit(`after the first, for ${(await headers()).get("x-client")}`);
      });
    },
    { headers: { "x-client": "first" } },
  );
  await runInServerAction(() => audit("the second"));

  await expect.poll(() => auditLog).toEqual(["after the first, for first", "the second"]);
});

test("leaves a page that is open as it is", async () => {
  await renderServer({ url: "/settings" });

  await runInServerAction(() => setLanguage("nl"));

  await page.getByRole("button", { name: "Use Dutch" }).click();
  await expect.element(page.getByText("Language: nl")).toBeInTheDocument();
});

test("runs at a URL of the app only", async () => {
  await expect(runInServerAction(() => {}, { url: "https://example.com/x" })).rejects.toThrow(
    "not of https://example.com/x",
  );
});

test("opens no page", async () => {
  const before = document.body.innerHTML;

  await runInServerAction(() => setLanguage("nl"));

  expect(document.body.innerHTML).toBe(before);
  expect(location.pathname).toBe("/");
});
