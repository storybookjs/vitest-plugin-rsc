import { ACTION_HEADER, RSC_HEADER } from "next/dist/client/components/app-router-headers.js";
import { expect, test } from "vitest";

const fetchRscSymbol = Symbol.for("vitest-plugin-rsc.nextjs.fetchRsc");

function getRegisteredFetchRsc() {
  return (globalThis as typeof globalThis & Record<symbol, unknown>)[fetchRscSymbol];
}

test("Next RSC handlers report missing generated Edge App Page targets", async () => {
  expect(getRegisteredFetchRsc()).toBeUndefined();

  const actionResponse = await fetch("/next-rsc-msw-lifecycle", {
    method: "POST",
    headers: {
      [ACTION_HEADER]: "missing-action",
    },
    body: "[]",
  });
  await expect(actionResponse.text()).resolves.toBe(
    'No generated Next Edge App Page handler found for Server Action POST "/next-rsc-msw-lifecycle".',
  );
  expect(actionResponse.status).toBe(404);

  const routeResponse = await fetch("/next-rsc-msw-lifecycle", {
    headers: {
      [RSC_HEADER]: "1",
    },
  });
  await expect(routeResponse.text()).resolves.toBe(
    'No generated Next Edge App Page handler found for RSC GET "/next-rsc-msw-lifecycle".',
  );
  expect(routeResponse.status).toBe(404);
});
