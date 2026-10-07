import {
  ACTION_HEADER,
  NEXT_ACTION_NOT_FOUND_HEADER,
  NEXT_URL,
  RSC_CONTENT_TYPE_HEADER,
  RSC_HEADER,
} from "next/dist/client/components/app-router-headers.js";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { handleRequest, renderServer } from "vitest-plugin-rsc/nextjs";
import { NextActionProtocolProbe } from "./next-action-protocol-probe.tsx";

type CapturedActionRequest = {
  url: string;
  headers: Headers;
  body: string;
};

test("action redirects answer with a redirect header and the Flight data of the target", async () => {
  await renderServer(<NextActionProtocolProbe />, { url: "/fixtures" });

  const request = await captureActionRequest(() =>
    page.getByRole("button", { name: "Capture redirect action" }).click(),
  );
  const response = await replayActionRequest(request);

  // Not an HTTP redirect: the router reads the header, and renders the target
  // from the body.
  expect(response.status).toBe(200);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("x-action-redirect")).toBe(
    "/fixtures/router/push/target?from=action;push",
  );
  expect(response.headers.get("content-type")).toContain(RSC_CONTENT_TYPE_HEADER);
  // The target is another route, so it renders its own page.
  await expect(response.text()).resolves.toContain("Fixture page");
});

test("default action redirects use Next's push redirect type", async () => {
  await renderServer(<NextActionProtocolProbe />, { url: "/fixtures" });

  const request = await captureActionRequest(() =>
    page.getByRole("button", { name: "Capture default redirect action" }).click(),
  );
  const response = await replayActionRequest(request);

  expect(response.status).toBe(200);
  expect(response.headers.get("x-action-redirect")).toBe(
    "/fixtures/router/default/target?from=action;push",
  );
});

test("the router follows an action redirect to its target", async () => {
  await renderServer(<NextActionProtocolProbe />, { url: "/fixtures" });

  await page.getByRole("button", { name: "Capture redirect action" }).click();

  await expect.poll(() => window.location.pathname).toBe("/fixtures/router/push/target");
  expect(window.location.search).toBe("?from=action");
  await expect.element(page.getByText("selected segments: router,push,target")).toBeVisible();
});

test("thrown action errors use Next's rejected Flight payload with status 500", async () => {
  await renderServer(<NextActionProtocolProbe />, { url: "/fixtures" });

  const request = await captureActionRequest(() =>
    page.getByRole("button", { name: "Capture throw action" }).click(),
  );
  const response = await ignoreExpectedConsoleError(() => replayActionRequest(request));

  expect(response.status).toBe(500);
  expect(response.headers.get("content-type")).toContain(RSC_CONTENT_TYPE_HEADER);
});

test("HTTP access fallback action errors keep their status and Flight payload", async () => {
  await renderServer(<NextActionProtocolProbe />, { url: "/fixtures" });

  const request = await captureActionRequest(() =>
    page.getByRole("button", { name: "Capture not-found action" }).click(),
  );
  const response = await ignoreExpectedConsoleError(() => replayActionRequest(request));

  expect(response.status).toBe(404);
  expect(response.headers.get("content-type")).toContain(RSC_CONTENT_TYPE_HEADER);
});

test("an action id that names no action gets Next's unrecognized-action response", async () => {
  await renderServer(<NextActionProtocolProbe />, { url: "/fixtures" });

  const response = await ignoreExpectedConsoleWarn(() =>
    handleRequest("/fixtures", {
      method: "POST",
      headers: {
        [ACTION_HEADER]: "missing-action-id",
      },
      body: "",
    }),
  );

  expect(response.status).toBe(409);
  expect(response.headers.get(NEXT_ACTION_NOT_FOUND_HEADER)).toBe("1");
  expect(response.headers.get("content-type")).toContain("text/plain");
  await expect(response.text()).resolves.toBe("Server Action unavailable.");
});

test("incoming next-url does not mark route payloads as interceptable", async () => {
  await renderServer(<NextActionProtocolProbe />, { url: "/fixtures" });

  const response = await handleRequest("/fixtures", {
    headers: {
      [RSC_HEADER]: "1",
      [NEXT_URL]: "/intercepted-origin",
    },
  });
  expect(response.status).toBe(200);

  await expect(response.text()).resolves.toContain('"i":false');
});

function startActionRequestCapture() {
  const originalFetch = globalThis.fetch;
  let captured: CapturedActionRequest | undefined;

  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method === "POST" && request.headers.has(ACTION_HEADER) && !captured) {
      captured = {
        url: request.url,
        headers: new Headers(request.headers),
        body: await request.clone().text(),
      };
      return new Response("captured action request", {
        status: 418,
        headers: { "content-type": "text/plain" },
      });
    }

    return originalFetch(request);
  };

  return {
    get captured() {
      return captured;
    },
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

async function captureActionRequest(trigger: () => Promise<unknown>) {
  const capture = startActionRequestCapture();
  try {
    await trigger();
    await vi.waitFor(() => expect(capture.captured).toBeDefined());
    return capture.captured!;
  } finally {
    capture.restore();
  }
}

function replayActionRequest(request: CapturedActionRequest) {
  return handleRequest(request.url, {
    method: "POST",
    headers: request.headers,
    body: request.body,
    redirect: "manual",
  });
}

async function ignoreExpectedConsoleError<T>(callback: () => Promise<T>) {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    return await callback();
  } finally {
    spy.mockRestore();
  }
}

async function ignoreExpectedConsoleWarn<T>(callback: () => Promise<T>) {
  const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    return await callback();
  } finally {
    spy.mockRestore();
  }
}
