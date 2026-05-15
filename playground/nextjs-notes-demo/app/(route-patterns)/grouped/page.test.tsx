import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renderServer resolves a route group in notes demo", async () => {
  const { nextRouteManifest } = await import("virtual:vitest-plugin-rsc/next-routes");
  const groupedRoute = nextRouteManifest.find((entry) => entry.route === "/grouped");

  expect(groupedRoute?.appPath).toBe("/(route-patterns)/grouped/page");

  await renderServer({ url: "/grouped" });

  await expect.element(page.getByLabelText("notes grouped route layout")).toBeVisible();
  await expect.element(page.getByRole("heading", { name: "Notes grouped route" })).toBeVisible();
});
