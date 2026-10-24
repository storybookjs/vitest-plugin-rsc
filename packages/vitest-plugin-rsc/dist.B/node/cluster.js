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
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/cluster.mjs
const SCHED_NONE = 1;
const SCHED_RR = 2;
const isMaster = true;
const isPrimary = true;
const isWorker = false;
const schedulingPolicy = 2;
const settings = {};
const workers = {};
const fork = /* @__PURE__ */ notImplemented("cluster.fork");
const disconnect = /* @__PURE__ */ notImplemented("cluster.disconnect");
const setupPrimary = /* @__PURE__ */ notImplemented("cluster.setupPrimary");
const setupMaster = /* @__PURE__ */ notImplemented("cluster.setupMaster");
const _events = [];
const _eventsCount = 0;
const _maxListeners = 0;
var Worker = class extends EventEmitter {
	_connected = false;
	id = 0;
	get process() {
		return globalThis.process;
	}
	get exitedAfterDisconnect() {
		return this._connected;
	}
	isConnected() {
		return this._connected;
	}
	isDead() {
		return true;
	}
	send(message, sendHandle, options, callback) {
		return false;
	}
	kill(signal) {
		this._connected = false;
	}
	destroy(signal) {
		this._connected = false;
	}
	disconnect() {
		this._connected = false;
		return this;
	}
};
var _Cluster = class extends EventEmitter {
	Worker = Worker;
	isMaster = true;
	isPrimary = true;
	isWorker = false;
	SCHED_NONE = 1;
	SCHED_RR = 2;
	schedulingPolicy = 2;
	settings = settings;
	workers = workers;
	setupPrimary(_settings) {
		setupPrimary();
	}
	setupMaster(_settings) {
		setupMaster();
	}
	disconnect() {
		disconnect();
	}
	fork(env) {
		return fork(env);
	}
};
var cluster_default = new _Cluster();
//#endregion
export { SCHED_NONE, SCHED_RR, Worker, _events, _eventsCount, _maxListeners, cluster_default as default, disconnect, fork, isMaster, isPrimary, isWorker, schedulingPolicy, settings, setupMaster, setupPrimary, workers };
