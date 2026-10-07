import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/testing-library";
import { openedWebSockets } from "../test/websockets.ts";
import { ClientCounter } from "./client.tsx";

test("loads a Client Component with the one Vite client that the tab has", async () => {
  await renderServer(<ClientCounter />);
  await expect.element(page.getByRole("button", { name: "client-counter: 0" })).toBeVisible();

  // Vite's client opens a `vite-hmr` websocket when it is evaluated, and the
  // tab had its own before the tests were set up. A Client Component is loaded
  // through a module runner, by a module that Vite imports its client into: a
  // copy there would open another one, to the port the server was configured
  // with. So the only such websockets since then are the module runner's own.
  const hmr = openedWebSockets.filter(({ protocols }) => [protocols].flat().includes("vite-hmr"));
  expect(hmr.length).toBeGreaterThan(0);
  expect(hmr.filter(({ url }) => !url.includes("vitest-plugin-rsc-react-client"))).toEqual([]);
});
