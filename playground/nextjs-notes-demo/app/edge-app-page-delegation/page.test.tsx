import {
  ACTION_HEADER,
  NEXT_ACTION_NOT_FOUND_HEADER,
  RSC_CONTENT_TYPE_HEADER,
} from "next/dist/client/components/app-router-headers.js";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

const actionIdPrefix = "/app/edge-app-page-delegation/actions.ts#";
const redirectDelegatedActionId = `${actionIdPrefix}redirectDelegatedAction`;
const replaceRedirectDelegatedActionId = `${actionIdPrefix}replaceRedirectDelegatedAction`;
const saveDelegatedNoteActionId = "/app/edge-app-page-delegation/actions.ts#saveDelegatedNote";

// Edge App Page uses generated Next dispatch for initial SSR and MSW for
// browser-observed requests.
test("renderServer uses the generated Edge App Page initial render path", async () => {
  await renderServer({ url: "/edge-app-page-delegation" });

  expect((window as typeof window & { next?: { appDir?: boolean } }).next?.appDir).toBe(true);
  await expect.element(page.getByText("Edge App Page delegation fixture")).toBeVisible();
});

test("real Server Action POST executes through the generated Edge App Page handler", async () => {
  const response = await fetch("/edge-app-page-delegation", {
    method: "POST",
    headers: {
      [ACTION_HEADER]: saveDelegatedNoteActionId,
    },
    body: JSON.stringify(["edge delegation"]),
  });

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain(RSC_CONTENT_TYPE_HEADER);
  await expect(response.text()).resolves.toContain("saved note: edge delegation");
});

test("Server Action redirects return Next action protocol semantics through MSW", async () => {
  const response = await postDelegatedAction(redirectDelegatedActionId);

  expect(response.status).toBe(303);
  expect(response.headers.get("x-action-redirect")).toBe(
    "/route-patterns/conventions?from=edge-action-redirect;push",
  );
  expect(response.headers.get("location")).toBeNull();
});

test("Server Action replace redirects preserve the redirect type through MSW", async () => {
  const response = await postDelegatedAction(replaceRedirectDelegatedActionId);

  expect(response.status).toBe(303);
  expect(response.headers.get("x-action-redirect")).toBe(
    "/route-patterns/conventions?from=edge-action-replace;replace",
  );
  expect(response.headers.get("location")).toBeNull();
});

test("browser RSC navigation follows page redirects through MSW Edge dispatch", async () => {
  await renderServer({ url: "/edge-app-page-delegation" });

  await page.getByRole("button", { name: "Follow RSC redirect" }).click();

  await vi.waitFor(() => {
    expect(window.location.pathname).toBe("/route-patterns/conventions");
    expect(window.location.search).toBe("?from=render-redirect");
  });
  await expect.element(page.getByRole("heading", { name: "Route conventions" })).toBeVisible();
  await expect.element(page.getByText("Redirect source: render-redirect")).toBeVisible();
});

test("Server Action POST reaches the generated Edge App Page handler through MSW", async () => {
  const response = await fetch("/edge-app-page-delegation", {
    method: "POST",
    headers: {
      [ACTION_HEADER]: "missing-action-id",
    },
    body: "",
  });

  expect(response.status).toBe(404);
  expect(response.headers.get(NEXT_ACTION_NOT_FOUND_HEADER)).toBe("1");
  await expect(response.text()).resolves.toBe("Server action not found.");
});

function postDelegatedAction(actionId: string) {
  return fetch("/edge-app-page-delegation", {
    method: "POST",
    headers: {
      [ACTION_HEADER]: actionId,
    },
    body: "[]",
  });
}
