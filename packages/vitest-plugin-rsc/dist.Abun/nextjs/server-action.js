"use server";
import { i as registry } from "../registry-DPyevx_W.js";
//#region src/nextjs/server-action.ts
/**
* The Server Action that `runInServerAction()` calls: it runs the function the
* test handed over. The test and the server share their modules, so that is
* the test's own function, inside the request of the action.
*/
async function runInServerActionOfTest(key) {
	const action = registry.serverActions.get(key);
	if (!action) throw new Error("vitest-plugin-rsc: no function to run as a Server Action");
	await action();
}
//#endregion
export { runInServerActionOfTest };
