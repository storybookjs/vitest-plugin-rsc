//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/trace_events/tracing.mjs
var Tracing = class {
	categories = "";
	enabled = false;
	disable() {
		this.enabled = false;
	}
	enable() {
		this.enabled = true;
	}
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/trace_events.mjs
const createTracing = function() {
	return new Tracing();
};
const getEnabledCategories = () => "";
var trace_events_default = {
	createTracing,
	getEnabledCategories
};
//#endregion
export { createTracing, trace_events_default as default, getEnabledCategories };
