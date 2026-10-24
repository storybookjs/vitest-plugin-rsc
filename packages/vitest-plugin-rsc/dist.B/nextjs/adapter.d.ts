import { NextAdapter } from "next";

//#region src/nextjs/adapter.d.ts
/** Who waits for the outcome of a build, by the build directory it made up for it. */
declare const receivers: Map<any, any>;
declare const adapter: NextAdapter;
//#endregion
export { adapter as default, receivers };