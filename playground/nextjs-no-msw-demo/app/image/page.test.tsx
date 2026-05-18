import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renderServer resolves a Next route that renders next/image", async () => {
  await renderServer({ url: "/image" });

  await expect.element(page.getByRole("heading", { name: "Image probe" })).toBeVisible();

  const image = page.getByRole("img", { name: "Vitest RSC logo" });
  await expect.element(image).toBeVisible();
  await expect.element(image).toHaveAttribute("src", "/vitest-rsc.png");
  await expect.element(image).toHaveAttribute("width", "64");
  await expect.element(image).toHaveAttribute("height", "32");
});
