import {
  ACTION_HEADER,
  RSC_HEADER,
} from "next/dist/client/components/app-router-headers.js";
import { expect, test } from "vitest";
import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

const fetchRscSymbol = Symbol.for("vitest-plugin-rsc.nextjs.fetchRsc");

function getRegisteredFetchRsc() {
  return (globalThis as typeof globalThis & Record<symbol, unknown>)[fetchRscSymbol];
}

async function Probe() {
  return <p>MSW lifecycle probe</p>;
}

test("Next RSC handlers report missing mounted fetchRsc", async () => {
  expect(getRegisteredFetchRsc()).toBeUndefined();

  const actionResponse = await fetch("/next-rsc-msw-lifecycle", {
    method: "POST",
    headers: {
      [ACTION_HEADER]: "missing-action",
    },
    body: "[]",
  });
  await expect(actionResponse.text()).resolves.toContain(
    "Next server actions require initialize({ nextRscRequestsViaMsw: true }) before using nextRscRequestHandlers.",
  );
  expect(actionResponse.status).toBe(500);

  const routeResponse = await fetch("/next-rsc-msw-lifecycle", {
    headers: {
      [RSC_HEADER]: "1",
    },
  });
  await expect(routeResponse.text()).resolves.toContain(
    "Next RSC requests require initialize({ nextRscRequestsViaMsw: true }) before using nextRscRequestHandlers.",
  );
  expect(routeResponse.status).toBe(500);
});

test("cleanup removes the mounted Next RSC fetch handler", async () => {
  expect(getRegisteredFetchRsc()).toBeUndefined();

  await renderServer(<Probe />, { url: "/next-rsc-msw-lifecycle" });
  expect(getRegisteredFetchRsc()).toEqual(expect.any(Function));

  await cleanup();
  expect(getRegisteredFetchRsc()).toBeUndefined();
});
