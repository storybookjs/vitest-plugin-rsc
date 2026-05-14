import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renderServer resolves a Next route group by URL", async () => {
  const { nextRouteManifest } = await import("virtual:vitest-plugin-rsc/next-routes");
  const groupedRoute = nextRouteManifest.find((entry) => entry.route === "/grouped");

  expect(groupedRoute?.appPath).toBe("/(group)/grouped/page");

  await renderServer({ url: "/grouped" });

  await expect.element(page.getByLabelText("grouped layout")).toBeVisible();
  await expect.element(page.getByRole("heading", { name: "Grouped route" })).toBeVisible();
});
