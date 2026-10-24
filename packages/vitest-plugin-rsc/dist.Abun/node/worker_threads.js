import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/worker_threads/broadcast-channel.mjs
var BroadcastChannel = class {
	name = "";
	onmessage = (message) => {};
	onmessageerror = (message) => {};
	close() {}
	postMessage(message) {}
	ref() {
		return this;
	}
	unref() {
		return this;
	}
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/worker_threads/message-port.mjs
var MessagePort = class extends EventEmitter {
	close() {}
	postMessage(value, transferList) {}
	ref() {}
	unref() {}
	start() {}
	addEventListener(type, listener) {
		this.on(type, listener);
	}
	removeEventListener(type, listener) {
		this.off(type, listener);
	}
	dispatchEvent(event) {
		return this.emit(event.type, event);
	}
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/worker_threads/message-channel.mjs
var MessageChannel = class {
	port1 = new MessagePort();
	port2 = new MessagePort();
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/worker_threads/worker.mjs
var Worker = class extends EventEmitter {
	stdin = null;
	stdout = new Readable();
	stderr = new Readable();
	threadId = 0;
	performance = { eventLoopUtilization: () => ({
		idle: 0,
		active: 0,
		utilization: 0
	}) };
	postMessage(_value, _transferList) {}
	postMessageToThread(_threadId, _value, _transferList, _timeout) {
		return Promise.resolve();
	}
	ref() {}
	unref() {}
	terminate() {
		return Promise.resolve(0);
	}
	getHeapSnapshot() {
		return Promise.resolve(new Readable());
	}
};
//#endregion
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
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/worker_threads.mjs
const _environmentData = /* @__PURE__ */ new Map();
const getEnvironmentData = function getEnvironmentData(key) {
	return _environmentData.get(key);
};
const setEnvironmentData = function setEnvironmentData(key, value) {
	_environmentData.set(key, value);
};
const isMainThread = true;
const isMarkedAsUntransferable = () => false;
const markAsUntransferable = function markAsUntransferable(value) {};
const markAsUncloneable = () => {};
const moveMessagePortToContext = () => new MessagePort();
const parentPort = null;
const receiveMessageOnPort = () => void 0;
const SHARE_ENV = /* @__PURE__ */ Symbol.for("nodejs.worker_threads.SHARE_ENV");
const resourceLimits = {};
const threadId = 0;
const workerData = null;
const postMessageToThread = /* @__PURE__ */ notImplemented("worker_threads.postMessageToThread");
const isInternalThread = false;
var worker_threads_default = {
	BroadcastChannel,
	MessageChannel,
	MessagePort,
	Worker,
	SHARE_ENV,
	getEnvironmentData,
	isMainThread: true,
	isMarkedAsUntransferable,
	markAsUntransferable,
	markAsUncloneable,
	moveMessagePortToContext,
	parentPort: null,
	receiveMessageOnPort,
	resourceLimits,
	setEnvironmentData,
	postMessageToThread,
	threadId: 0,
	workerData: null,
	isInternalThread: false
};
//#endregion
export { BroadcastChannel, MessageChannel, MessagePort, SHARE_ENV, Worker, worker_threads_default as default, getEnvironmentData, isInternalThread, isMainThread, isMarkedAsUntransferable, markAsUncloneable, markAsUntransferable, moveMessagePortToContext, parentPort, postMessageToThread, receiveMessageOnPort, resourceLimits, setEnvironmentData, threadId, workerData };
