import { renderServer } from "vitest-plugin-rsc/next";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { getForecast } from "../lib/weather.ts";

vi.mock("../lib/weather.ts");

test("renders a route with a mocked server module", async () => {
  vi.mocked(getForecast).mockResolvedValue("sunny");

  await renderServer({ url: "/forecast" });

  await expect.element(page.getByText("Today: sunny")).toBeVisible();
  expect(getForecast).toHaveBeenCalledOnce();
});
