import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { ServerHeading } from "./server-heading.tsx";

// This test file and client-heading.test.tsx each render a component whose
// CSS styles every `<h3>` of the page. A node has the CSS of what its own test
// file imports, and not that of the other one, also when Vite's module graph
// has both.
test("links the CSS of what its test file imports, and not that of another test file", async () => {
  await renderServer(<ServerHeading>A heading of the server</ServerHeading>);

  const heading = page.getByRole("heading", { name: "A heading of the server" });
  await expect.element(heading).toHaveStyle({ color: "rgb(200, 0, 0)" });
  // Not the CSS of client-heading.tsx.
  expect(getComputedStyle(heading.element()).textDecorationLine).toBe("none");
});
