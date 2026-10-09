import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { ClientHeading } from "./client-heading.tsx";

// See server-heading.test.tsx: this one renders a Client Component.
test("links the CSS of what its test file imports, and not that of another test file", async () => {
  await renderServer(<ClientHeading>A heading of the browser</ClientHeading>);

  const heading = page.getByRole("heading", { name: "A heading of the browser" });
  await expect.element(heading).toHaveStyle({ textDecorationLine: "underline" });
  // Not the CSS of server-heading.tsx.
  expect(getComputedStyle(heading.element()).color).toBe("rgb(0, 0, 0)");
});
