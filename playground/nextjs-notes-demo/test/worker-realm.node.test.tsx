import { readFileSync } from "node:fs";
import { expect, onTestFinished, test } from "vitest";

// What a test, which runs on the worker's global with the server, has of
// Node.js and of the page in a Node.js worker: see the node projects of
// vitest.config.ts. A relative `fetch` of the page's own is
// app/request-probe/page.node.test.tsx.

test("a file next to a test is its own file, as on Node.js", () => {
  // Vite and Vitest's environment of a DOM make it a URL of the page, which
  // `fs` does not read: a package that sees Node.js, like PGlite, fails.
  const url = new URL("./worker-realm.node.test.tsx", import.meta.url);
  expect(url.protocol).toBe("file:");
  expect(readFileSync(url, "utf8")).toContain("a file next to a test is its own file");
});

test("a FormData of a form of the page has its fields, as in a browser", () => {
  const form = document.createElement("form");
  form.innerHTML = `<input name="step" value="0.3"><button name="answer" value="yes">Ja</button>`;
  document.body.append(form);
  onTestFinished(() => form.remove());
  const data = new FormData(form, form.querySelector("button"));
  expect([...data.entries()]).toEqual([
    ["step", "0.3"],
    ["answer", "yes"],
  ]);
  expect(data).toBeInstanceOf(FormData);
});

test("a FormData without a form is the server's, for its requests", async () => {
  const data = new FormData();
  data.append("step", "0.3");
  expect(data).toBeInstanceOf(FormData);
  const request = new Request("http://localhost/", { method: "POST", body: data });
  expect((await request.formData()).get("step")).toBe("0.3");
});
