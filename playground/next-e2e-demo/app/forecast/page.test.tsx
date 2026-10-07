import { renderServer } from "vitest-plugin-rsc/next";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { getForecast } from "../lib/weather.ts";

// The mock itself is in vitest.setup.ts.
test("renders a route with a server module mocked in the setup file", async () => {
  vi.mocked(getForecast).mockResolvedValue("sunny");

  await renderServer({ url: "/forecast" });

  await expect.element(page.getByText("Today: sunny")).toBeVisible();
  expect(getForecast).toHaveBeenCalledOnce();
});
