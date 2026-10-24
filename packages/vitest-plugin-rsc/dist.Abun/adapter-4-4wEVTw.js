//#region src/nextjs/adapter.ts
const scope = globalThis;
/** Who waits for the outcome of a build, by the build directory it made up for it. */
const receivers = scope.__vitest_plugin_rsc_next_adapter__ ??= /* @__PURE__ */ new Map();
const adapter = {
	name: "vitest-plugin-rsc",
	onBuildComplete(context) {
		receivers.get(context.distDir)?.(context);
	}
};
//#endregion
export { receivers as n, adapter as t };
