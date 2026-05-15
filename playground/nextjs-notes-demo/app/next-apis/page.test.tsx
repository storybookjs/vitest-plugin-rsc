import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { getAfterProbeRuns, getNestedAfterProbeRuns, resetAfterProbe } from "./after-probe";

test("notes demo renders Next app-router API aliases and compiler surfaces", async () => {
  resetAfterProbe();

  await renderServer({ url: "/next-apis" });

  await expect.element(page.getByRole("heading", { name: "Next APIs" })).toBeVisible();
  await expect.element(page.getByText("Connection scope ready")).toBeVisible();
  await expect.element(page.getByText("Root params available: none")).toBeVisible();
  await expect.element(page.getByText("After task scheduled")).toBeVisible();
  expect(getAfterProbeRuns()).toBe(1);
  expect(getNestedAfterProbeRuns()).toBe(1);
  await expect
    .element(page.getByRole("link", { name: "Notes link" }))
    .toHaveAttribute("href", "/notes");
  await expect
    .element(page.getByRole("textbox", { name: "Search notes" }))
    .toHaveValue("next-form");
  await expect.element(page.getByRole("button", { name: "Search" })).toBeVisible();
  await expect.element(page.getByText("Dynamic panel loaded")).toBeVisible();
  await expect.element(page.getByText("Pathname: /next-apis")).toBeVisible();
  await expect.element(page.getByText("Client error boundary ready")).toBeVisible();
  await expect.element(page.getByText("Web vitals hook ready")).toBeVisible();

  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await page.getByRole("button", { name: "Trigger client error" }).click();
    await expect
      .element(page.getByText("Client error caught: next error boundary boom"))
      .toBeVisible();
    await page.getByRole("button", { name: "Recover client error" }).click();
  } finally {
    consoleError.mockRestore();
  }

  await expect.element(page.getByText("Client error boundary ready")).toBeVisible();

  const image = page.getByRole("img", { name: "Next API image" });
  await expect.element(image).toBeVisible();
  await expect.element(image).toHaveAttribute("src", "/vitest-rsc.png");
  await expect.element(image).toHaveAttribute("width", "48");
  await expect.element(image).toHaveAttribute("height", "24");

  const staticImage = page.getByRole("img", { name: "Imported static logo" });
  await expect.element(staticImage).toBeVisible();
  await expect.element(staticImage).toHaveAttribute("width", "32");
  await expect.element(staticImage).toHaveAttribute("height", "16");
  const staticImageSrc = document.querySelector<HTMLImageElement>(
    'img[alt="Imported static logo"]',
  )?.src;
  expect(staticImageSrc).toContain("static-logo.");
  const staticImageResponse = await fetch(staticImageSrc!);
  expect(staticImageResponse.ok).toBe(true);
  expect(await staticImageResponse.text()).toContain("static logo");

  const imagePropsImage = page.getByRole("img", { name: "Next getImageProps image" });
  await expect.element(imagePropsImage).toBeVisible();
  await expect.element(imagePropsImage).toHaveAttribute("src", "/vitest-rsc.png");
  await expect.element(imagePropsImage).toHaveAttribute("width", "16");
  await expect.element(imagePropsImage).toHaveAttribute("height", "8");

  const configuredImagePropsImage = page.getByRole("img", {
    name: "Configured optimized image",
  });
  await expect.element(configuredImagePropsImage).toBeVisible();
  const configuredImageSrc = configuredImagePropsImage.element().getAttribute("src") ?? "";
  expect(configuredImageSrc).toContain("/custom-next-image?");
  expect(configuredImageSrc).toContain("url=%2Fvitest-rsc.png");

  expect(document.querySelector("#next-api-script")?.textContent).toBe(
    'window.__nextApiScript = "loaded";',
  );
  expect(document.title).not.toBe("Ignored by App Router head");
});

test("renderServer applies next.config rewrites before resolving app routes", async () => {
  await renderServer({ url: "/next-config-rewrite" });

  await expect.element(page.getByRole("heading", { name: "Next APIs" })).toBeVisible();
  await expect.element(page.getByText("Connection scope ready")).toBeVisible();
});

test("renderServer follows next.config redirects before resolving app routes", async () => {
  await renderServer({ url: "/next-config-redirect" });

  await expect.element(page.getByRole("heading", { name: "Next APIs" })).toBeVisible();
  await expect.element(page.getByText("Connection scope ready")).toBeVisible();
});
