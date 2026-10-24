//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/_internal/utils.mjs
/* @__NO_SIDE_EFFECTS__ */
function notImplementedClass(name) {
	return class {
		__unenv__ = true;
		constructor() {
			throw new Error(`[unenv] ${name} is not implemented yet!`);
		}
	};
}
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/sqlite.mjs
const DatabaseSync = /* @__PURE__ */ notImplementedClass("sqlite.DatabaseSync");
const StatementSync = /* @__PURE__ */ notImplementedClass("sqlite.StatementSync");
const constants = {};
var sqlite_default = {
	DatabaseSync,
	StatementSync,
	constants
};
//#endregion
export { DatabaseSync, StatementSync, constants, sqlite_default as default };
