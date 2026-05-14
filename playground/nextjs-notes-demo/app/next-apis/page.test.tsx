import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("notes demo renders Next app-router API aliases and compiler surfaces", async () => {
  await renderServer({ url: "/next-apis" });

  await expect.element(page.getByRole("heading", { name: "Next APIs" })).toBeVisible();
  await expect
    .element(page.getByRole("link", { name: "Notes link" }))
    .toHaveAttribute("href", "/notes");
  await expect
    .element(page.getByRole("textbox", { name: "Search notes" }))
    .toHaveValue("next-form");
  await expect.element(page.getByRole("button", { name: "Search" })).toBeVisible();
  await expect.element(page.getByText("Dynamic panel loaded")).toBeVisible();
  await expect.element(page.getByText("Pathname: /next-apis")).toBeVisible();

  const image = page.getByRole("img", { name: "Next API image" });
  await expect.element(image).toBeVisible();
  await expect.element(image).toHaveAttribute("src", "/vitest-rsc.png");
  await expect.element(image).toHaveAttribute("width", "48");
  await expect.element(image).toHaveAttribute("height", "24");

  expect(document.title).not.toBe("Ignored by App Router head");
});
