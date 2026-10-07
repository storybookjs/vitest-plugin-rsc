import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/testing-library";
import { openedWebSockets } from "../test/websockets.ts";
import { ClientCounter } from "./client.tsx";

test("loads a Client Component with the one Vite client that the tab has", async () => {
  await renderServer(<ClientCounter />);
  await expect.element(page.getByRole("button", { name: "client-counter: 0" })).toBeVisible();

  // Vite's client opens a websocket when it is evaluated, and the tab had its
  // own before the tests were set up. A Client Component is loaded by a module
  // that Vite imports its client into, through a module runner: a copy there
  // would open another one, to the port the server was configured with, which
  // is the server of another Vitest run when that port was taken. So the one
  // websocket since then is the module runner's, to the server of this page.
  expect(
    openedWebSockets.map((url) => [
      url.host,
      url.searchParams.has("vitest-plugin-rsc-react-client"),
    ]),
  ).toEqual([[window.location.host, true]]);
});
