import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renderServer exposes selected layout segments in a real notes route layout", async () => {
  const { container } = await renderServer({
    url: "/route-patterns/selected-layout/alpha",
  });

  expect(container).toBe(document.body);
  await expect.element(page.getByTestId("notes-route-patterns-layout")).toBeVisible();
  await expect.element(page.getByText("layout selected segment: alpha")).toBeVisible();
  await expect.element(page.getByText("layout selected segments: alpha")).toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: "Selected layout page alpha" }))
    .toBeVisible();
});
