"use server";

import { registry } from "./registry.ts";

/**
 * The Server Action that `runInServerAction()` calls: it runs the function the
 * test handed over. The test and the server share their modules, so that is
 * the test's own function, inside the request of the action.
 */
export async function runInServerActionOfTest(key: number): Promise<void> {
  const action = registry.serverActions.get(key);
  if (!action) throw new Error("vitest-plugin-rsc: no function to run as a Server Action");
  await action();
}
