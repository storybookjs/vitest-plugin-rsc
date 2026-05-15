import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renderServer replaces the matched dynamic page inside the notes demo layouts", async () => {
  const { nextRouteManifest } = await import("virtual:vitest-plugin-rsc/next-routes");
  const settingsRoute = nextRouteManifest.find(
    (entry) => entry.route === "/route-patterns/[team]/settings",
  );

  expect(settingsRoute?.appPath).toBe("/route-patterns/[team]/settings/page");

  const { container } = await renderServer(<h1>Replacement notes team settings</h1>, {
    url: "/route-patterns/acme/settings",
  });

  expect(container).toBe(document.body);
  expect(document.body.querySelector("html")).toBeNull();
  expect(document.body.querySelector("body")).toBeNull();
  await expect.element(page.getByTestId("notes-route-patterns-layout")).toBeVisible();
  await expect.element(page.getByLabelText("notes team layout acme")).toBeVisible();
  await expect.element(page.getByTestId("notes-team-layout-param")).toHaveTextContent("acme");
  await expect
    .element(page.getByRole("heading", { name: "Replacement notes team settings" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: "acme notes settings page" }))
    .not.toBeInTheDocument();
});
