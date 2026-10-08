import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { runCheck } from "../../scripts/run-check.ts";

const script = fileURLToPath(new URL("./check.ts", import.meta.url));
const storybook = fileURLToPath(new URL("./check-storybook.ts", import.meta.url));

test("the app runs in a host page of a dev server", async () => {
  await runCheck(script);
});

test("the stories run in Storybook's dev server", { timeout: 300_000 }, async () => {
  // Not the port of `pnpm storybook`, which may be running.
  await runCheck(storybook, "--port=6116");
});
