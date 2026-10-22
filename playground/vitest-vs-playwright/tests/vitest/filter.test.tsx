// One for one with tests/playwright/filter.spec.ts.
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { seed } from "#test/db.ts";

test("filters the list", async () => {
  await seed(["Milk", "Bread", "Oat milk"]);
  await renderServer({ url: "/" });

  await page.getByLabelText("Filter").fill("milk");

  await expect.element(page.getByRole("link", { name: "Milk", exact: true })).toBeInTheDocument();
  await expect.element(page.getByRole("link", { name: "Oat milk" })).toBeInTheDocument();
  await expect.element(page.getByRole("link", { name: "Bread" })).not.toBeInTheDocument();
});

test("filters without regard to case", async () => {
  await seed(["Milk", "Bread"]);
  await renderServer({ url: "/" });

  await page.getByLabelText("Filter").fill("BREAD");

  await expect.element(page.getByRole("link", { name: "Bread" })).toBeInTheDocument();
  await expect.element(page.getByRole("link", { name: "Milk" })).not.toBeInTheDocument();
});

test("says so when no todo matches", async () => {
  await seed(["Milk"]);
  await renderServer({ url: "/" });

  await page.getByLabelText("Filter").fill("cheese");

  await expect.element(page.getByText("No todos match")).toBeInTheDocument();
});

test("shows every todo again when the filter is cleared", async () => {
  await seed(["Milk", "Bread"]);
  await renderServer({ url: "/" });

  await page.getByLabelText("Filter").fill("milk");
  await expect.element(page.getByRole("link", { name: "Bread" })).not.toBeInTheDocument();
  await page.getByLabelText("Filter").fill("");

  await expect.element(page.getByRole("link", { name: "Bread" })).toBeInTheDocument();
  await expect.element(page.getByRole("link", { name: "Milk" })).toBeInTheDocument();
});

test("keeps the count of every todo while filtering", async () => {
  await seed(["Milk", "Bread"], ["Bread"]);
  await renderServer({ url: "/" });

  await page.getByLabelText("Filter").fill("milk");

  await expect.element(page.getByText("1 of 2 done")).toBeInTheDocument();
});
