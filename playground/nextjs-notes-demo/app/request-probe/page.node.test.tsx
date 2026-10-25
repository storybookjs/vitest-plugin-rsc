import { expect, test } from "vitest";
import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { handleRequest, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

// The requests of a Client Component to a route handler in a Node.js worker:
// see the node projects of vitest.config.ts. The page's `fetch` is the
// plugin's, as in a browser. With happy-dom the rest of the page's fetch API
// is happy-dom's, whose interceptor hands the app's requests of
// `XMLHttpRequest` to the server too; jsdom has none of its own, and only its
// `fetch` reaches the app.

const screen = () => within(document.body);
const happyDom = "happyDOM" in window;

// The first request of a route handler compiles it, which takes longer than
// the second that `findByText()` waits by default on a busy machine.
const answer = (text: string) =>
  screen().findByText(`answer: ${text}`, undefined, { timeout: 5_000 });

test("a fetch of a Client Component reaches a route handler, with the cookies the app set", async () => {
  await renderServer({ url: "/request-probe" });
  const button = await screen().findByRole("button", { name: "fetch" });
  await userEvent.click(button);
  expect(await answer("200 GET cookie=none set-cookie=hidden")).toBeTruthy();
  await userEvent.click(button);
  expect(await answer("200 GET cookie=echo=seen; next=seen set-cookie=hidden")).toBeTruthy();
});

test("handleRequest() takes a Request of the page's, for a route that fetches with one of its own", async () => {
  const response = await handleRequest(new Request(new URL("/api/echo/network", location.href)));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ network: "from the network" });
});

test("a fetch follows a redirect of the app", async () => {
  await renderServer({ url: "/request-probe" });
  await userEvent.click(await screen().findByRole("button", { name: "redirect" }));
  expect(await answer("redirected=true /api/echo GET")).toBeTruthy();
});

test.runIf(happyDom)(
  "an XMLHttpRequest of a Client Component reaches a route handler",
  async () => {
    await renderServer({ url: "/request-probe" });
    await userEvent.click(await screen().findByRole("button", { name: "fetch" }));
    await answer("200 GET cookie=none set-cookie=hidden");
    await userEvent.click(await screen().findByRole("button", { name: "xhr" }));
    expect(await answer("xhr 200 GET cookie=echo=seen; next=seen")).toBeTruthy();
  },
);

test.runIf(happyDom)(
  "a file uploads through a form, and the page reads it with its own Response",
  async () => {
    await renderServer({ url: "/request-probe" });
    await userEvent.type(await screen().findByLabelText("title"), "a note");
    // The files that a file chooser gives the input. Not `userEvent.upload()`,
    // which sets `files` on the element itself, where happy-dom's `FormData`
    // does not read them.
    const chosen = new DataTransfer();
    chosen.items.add(new File(["hello"], "hello.txt", { type: "text/plain" }));
    (await screen().findByLabelText<HTMLInputElement>("file")).files = chosen.files;
    await userEvent.click(await screen().findByRole("button", { name: "upload" }));
    expect(await answer("a note hello.txt hello read=hello")).toBeTruthy();
  },
);
