import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

// env/server.ts has no default for SUPPORT_EMAIL: the page's server code
// reads it from .env.test, as the plugin fills `process.env` for a run.
test("shows the support address of the env", async () => {
  await renderServer({ url: "/" });

  await expect
    .element(page.getByRole("link", { name: "support@notes.example" }))
    .toHaveAttribute("href", "mailto:support@notes.example");
});
