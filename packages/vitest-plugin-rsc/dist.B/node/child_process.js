//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/_internal/utils.mjs
/* @__NO_SIDE_EFFECTS__ */
function createNotImplementedError(name) {
	return /* @__PURE__ */ new Error(`[unenv] ${name} is not implemented yet!`);
}
/* @__NO_SIDE_EFFECTS__ */
function notImplemented(name) {
	const fn = () => {
		throw /* @__PURE__ */ createNotImplementedError(name);
	};
	return Object.assign(fn, { __unenv__: true });
}
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
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/child_process.mjs
const ChildProcess = /* @__PURE__ */ notImplementedClass("child_process.ChildProcess");
const _forkChild = /* @__PURE__ */ notImplemented("child_process.ChildProcess");
const exec = /* @__PURE__ */ notImplemented("child_process.exec");
const execFile = /* @__PURE__ */ notImplemented("child_process.execFile");
const execFileSync = /* @__PURE__ */ notImplemented("child_process.execFileSync");
const execSync = /* @__PURE__ */ notImplemented("child_process.execSyn");
const fork = /* @__PURE__ */ notImplemented("child_process.fork");
const spawn = /* @__PURE__ */ notImplemented("child_process.spawn");
const spawnSync = /* @__PURE__ */ notImplemented("child_process.spawnSync");
var child_process_default = {
	ChildProcess,
	_forkChild,
	exec,
	execFile,
	execFileSync,
	execSync,
	fork,
	spawn,
	spawnSync
};
//#endregion
export { ChildProcess, _forkChild, child_process_default as default, exec, execFile, execFileSync, execSync, fork, spawn, spawnSync };
