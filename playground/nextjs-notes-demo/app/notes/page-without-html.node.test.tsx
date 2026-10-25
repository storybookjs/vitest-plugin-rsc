import { expect, test } from "vitest";
import { within } from "@testing-library/dom";
import { signedInAs } from "#test/auth.ts";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

// A page without HTML of the server (`ssr: false`) in a Node.js worker with
// happy-dom or jsdom: see the node projects of vitest.config.ts. React renders
// it on the client and commits it only once the stylesheets of its layout
// have loaded, which no DOM of Node.js loads: the host answers them as a
// browser would (src/node-dom.ts of the plugin).

const screen = () => within(document.body);

test("a page without HTML renders once its stylesheets have loaded", async () => {
  await signedInAs();
  await renderServer({ url: "/notes", ssr: false });
  expect(await screen().findByRole("heading", { name: "Notes" })).toBeTruthy();
  // What React put in the document as it committed the page.
  expect(document.querySelector('link[rel="stylesheet"][data-precedence]')).not.toBeNull();
});
