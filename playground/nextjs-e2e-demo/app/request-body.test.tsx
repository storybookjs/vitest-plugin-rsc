import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { expect, test } from "vitest";
import { page } from "vitest/browser";

// A browser's `fetch` sends a body as a stream over HTTP/2 only. The app's
// server sends one as Node's `fetch` does: as a string, a Request of its own,
// or a stream.
test("sends the body of a request of the server to a service, whatever it is made of", async () => {
  await renderServer({ url: "/request-body" });

  await expect.element(page.getByText("Init: PUT init")).toBeVisible();
  await expect.element(page.getByText("Request: PUT request")).toBeVisible();
  await expect.element(page.getByText("Stream: POST stream")).toBeVisible();
});
