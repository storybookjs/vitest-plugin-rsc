import { EventEmitter } from "node:events";
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
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/http/agent.mjs
var Agent$1 = class extends EventEmitter {
	__unenv__ = {};
	maxFreeSockets = 256;
	maxSockets = Infinity;
	maxTotalSockets = Infinity;
	freeSockets = {};
	sockets = {};
	requests = {};
	options;
	constructor(opts = {}) {
		super();
		this.options = opts;
	}
	destroy() {}
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/https.mjs
const Server = /* @__PURE__ */ notImplementedClass("https.Server");
const Agent = Agent$1;
const globalAgent = /* @__PURE__ */ new Agent();
const get = /* @__PURE__ */ notImplemented("https.get");
const createServer = /* @__PURE__ */ notImplemented("https.createServer");
const request = /* @__PURE__ */ notImplemented("https.request");
var https_default = {
	Server,
	Agent,
	globalAgent,
	get,
	createServer,
	request
};
//#endregion
export { Agent, Server, createServer, https_default as default, get, globalAgent, request };
