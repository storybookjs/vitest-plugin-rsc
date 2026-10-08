import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { runCheck } from "../../scripts/run-check.ts";

const script = fileURLToPath(new URL("./check.ts", import.meta.url));

test("the app runs in a host page of a dev server", async () => {
  await runCheck(script);
});
