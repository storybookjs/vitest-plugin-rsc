import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { getAfterProbeRuns, resetAfterProbe } from "./after-probe";

test("notes demo renders Next app-router API aliases and compiler surfaces", async () => {
  resetAfterProbe();

  await renderServer({ url: "/next-apis" });

  await expect.element(page.getByRole("heading", { name: "Next APIs" })).toBeVisible();
  await expect.element(page.getByText("Connection scope ready")).toBeVisible();
  await expect.element(page.getByText("After task scheduled")).toBeVisible();
  await vi.waitFor(() => expect(getAfterProbeRuns()).toBe(1));
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

  const staticImage = page.getByRole("img", { name: "Imported static logo" });
  await expect.element(staticImage).toBeVisible();
  await expect.element(staticImage).toHaveAttribute("width", "32");
  await expect.element(staticImage).toHaveAttribute("height", "16");
  expect(
    document.querySelector<HTMLImageElement>('img[alt="Imported static logo"]')?.src,
  ).toContain("/_next/static/media/static-logo.");

  expect(document.querySelector("#next-api-script")?.textContent).toBe(
    'window.__nextApiScript = "loaded";',
  );
  expect(document.title).not.toBe("Ignored by App Router head");
});
