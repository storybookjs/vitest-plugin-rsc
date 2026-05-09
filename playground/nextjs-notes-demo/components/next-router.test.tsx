import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import {
  expectToHaveBeenNavigatedTo,
  NextRouter,
  renderServer,
} from "vitest-plugin-rsc/nextjs/testing-library";
import { NextRouterProbe } from "./next-router-probe";
import { resetServerRefreshProbe, ServerRefreshProbe } from "./server-refresh-probe";

test("NextRouter provides app router hooks and records navigation", async () => {
  await renderServer(
    <NextRouter url="/note/123/hello?q=test" route="/note/[id]/[slug]">
      <NextRouterProbe />
    </NextRouter>,
  );

  await page
    .getByRole("button", {
      name: "/note/123/hello:123:hello:test",
    })
    .click();

  await vi.waitFor(() => expectToHaveBeenNavigatedTo({ pathname: "/note/next" }));
});

test("server actions without refresh leave the current server tree stale", async () => {
  resetServerRefreshProbe();

  await renderServer(
    <NextRouter url="/refresh-probe">
      <ServerRefreshProbe shouldRefresh={false} />
    </NextRouter>,
  );

  await expect.element(page.getByText("server count: 0")).toBeVisible();
  await page.getByRole("button", { name: "Increment" }).click();

  await expect.element(page.getByText("server count: 0")).toBeVisible();
});

test("server refresh updates the current server tree", async () => {
  resetServerRefreshProbe();

  await renderServer(
    <NextRouter url="/refresh-probe">
      <ServerRefreshProbe shouldRefresh />
    </NextRouter>,
  );

  await expect.element(page.getByText("server count: 0")).toBeVisible();
  await page.getByRole("button", { name: "Increment" }).click();

  await expect.element(page.getByText("server count: 1")).toBeVisible();
});
