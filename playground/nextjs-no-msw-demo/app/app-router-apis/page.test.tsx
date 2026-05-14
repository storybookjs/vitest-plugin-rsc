import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renderServer resolves Next app-router API webpack aliases", async () => {
  await renderServer({ url: "/app-router-apis" });

  await expect.element(page.getByRole("heading", { name: "App Router APIs" })).toBeVisible();
  await expect.element(page.getByRole("link", { name: "Route probe link" })).toHaveAttribute(
    "href",
    "/route-probe",
  );
  await expect.element(page.getByRole("textbox", { name: "Form query" })).toHaveValue("next-form");
  await expect.element(page.getByRole("button", { name: "Search" })).toBeVisible();
  await expect.element(page.getByText("Dynamic app component loaded")).toBeVisible();
  await expect.element(page.getByText("Pathname: /app-router-apis")).toBeVisible();
  await expect.element(page.getByText("Error API: function")).toBeVisible();

  expect(document.title).not.toBe("Ignored by app router noop head");
});
