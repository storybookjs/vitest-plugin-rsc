import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { generateStaticParams } from "./page.tsx";

test("dynamic app routes expose generateStaticParams", () => {
  expect(generateStaticParams()).toEqual([{ team: "acme" }, { team: "beta" }]);
});

test("renderServer renders the matched dynamic page inside the notes demo layouts", async () => {
  const { nextRouteManifest } = await import("virtual:vitest-plugin-rsc/next-routes");
  const settingsRoute = nextRouteManifest.find(
    (entry) => entry.route === "/route-patterns/[team]/settings",
  );

  expect(settingsRoute?.appPath).toBe("/route-patterns/[team]/settings/page");

  const { container } = await renderServer({
    url: "/route-patterns/acme/settings",
  });

  expect(container).toBe(document.body);
  await expect.element(page.getByTestId("notes-route-patterns-layout")).toBeVisible();
  await expect.element(page.getByLabelText("notes team layout acme")).toBeVisible();
  await expect.element(page.getByTestId("notes-team-layout-param")).toHaveTextContent("acme");
  expect(document.title).toBe("acme settings metadata");
  await expect
    .element(page.getByRole("heading", { name: "acme notes settings page" }))
    .toBeVisible();
});
