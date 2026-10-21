import fs from "node:fs";
import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { beforeEach, describe, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";

// The server's disk is in memory, and the test's `fs` is the same disk. Every
// test starts with an empty one, as it starts with no cookies.

test("shows the server code a file that the test wrote", async () => {
  fs.mkdirSync("/notes");
  fs.writeFileSync("/notes/today.txt", "from the test");

  await renderServer({ url: "/disk" });

  await expect.element(page.getByText("Note: from the test")).toBeVisible();
});

test("keeps what a Server Action writes, for the next render and the test", async () => {
  await renderServer({ url: "/disk" });
  await expect.element(page.getByText("Note: none")).toBeVisible();

  await userEvent.fill(page.getByLabelText("Note"), "from the action");
  await userEvent.click(page.getByRole("button", { name: "Save" }));

  await expect.element(page.getByText("Note: from the action")).toBeVisible();
  expect(fs.readFileSync("/notes/today.txt", "utf8")).toBe("from the action");
});

test("starts with an empty disk, as Node.js has it: the temporary directory", async () => {
  expect(fs.readdirSync("/")).toEqual(["tmp"]);
  expect(fs.readdirSync("/tmp")).toEqual([]);

  await renderServer({ url: "/disk" });

  await expect.element(page.getByText("Note: none")).toBeVisible();
});

describe("with a file that a beforeEach() wrote", () => {
  // Runs after the plugin's own, which empties the disk.
  beforeEach(() => {
    fs.mkdirSync("/notes");
    fs.writeFileSync("/notes/today.txt", "from a hook");
  });

  test("shows it to the server code", async () => {
    await renderServer({ url: "/disk" });

    await expect.element(page.getByText("Note: from a hook")).toBeVisible();
  });
});

test("gives the server code the other modules of Node.js, as a browser can have them", async () => {
  await renderServer({ url: "/node-modules" });

  for (const text of [
    "Waited: 100 ms",
    "Status 404: Not Found",
    'Lines end in "\\n"',
    "Joined: /notes/today.txt",
    "From a URL: /notes/today.txt",
    "A date: true",
    "A time: bigint",
    "A UUID: 36 characters",
    "A temporary directory: made",
    "HMAC: 5d5d139563c95b5967b9bd9a8c9b233a9dedb45072794cd232dc1b74832607d0",
    "Its own path: the file's",
    "Require: vitest-plugin-rsc: module.createRequire()'s require of Node.js is not there in the browser",
    "base64url: aGk_ aA hi? hi",
  ]) {
    await expect.element(page.getByText(text)).toBeVisible();
  }
});

test("closes what watches a file of the disk when the test ends", async () => {
  fs.mkdirSync("/notes");
  fs.writeFileSync("/notes/today.txt", "first");
  let closed = false;
  fs.watch("/notes/today.txt", () => {}).on("close", () => (closed = true));

  await cleanup();

  expect(closed).toBe(true);
});
