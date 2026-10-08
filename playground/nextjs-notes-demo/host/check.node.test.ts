import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { runCheck } from "../../../scripts/run-check.ts";

const script = fileURLToPath(new URL("./check.ts", import.meta.url));

// The script builds the app and opens a browser, in a process of its own.
// With a dev server the app has the tests of the browser project.
test("the app runs in a static build", { timeout: 300_000 }, async () => {
  await runCheck(script, "--build");
});
