//#region src/nextjs/server-action.d.ts
/**
 * The Server Action that `runInServerAction()` calls: it runs the function the
 * test handed over. The test and the server share their modules, so that is
 * the test's own function, inside the request of the action.
 */
declare function runInServerActionOfTest(key: number): Promise<void>;
//#endregion
export { runInServerActionOfTest };