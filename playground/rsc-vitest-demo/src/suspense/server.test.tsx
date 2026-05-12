import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/testing-library";
import { TestSuspense } from "./server.tsx";

test("suspense", async () => {
  await renderServer(<TestSuspense />);

  await expect.element(page.getByTestId("suspense")).toHaveTextContent("suspense-fallback");

  await expect.element(page.getByTestId("suspense")).toHaveTextContent("suspense-resolved");
});
