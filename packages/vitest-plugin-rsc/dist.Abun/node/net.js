import { EventEmitter } from "node:events";
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/_internal/utils.mjs
/* @__NO_SIDE_EFFECTS__ */
function mergeFns(...functions) {
	return function(...args) {
		for (const fn of functions) fn(...args);
	};
}
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
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/stream/readable.mjs
var _Readable = class _Readable extends EventEmitter {
	__unenv__ = true;
	readableEncoding = null;
	readableEnded = true;
	readableFlowing = false;
	readableHighWaterMark = 0;
	readableLength = 0;
	readableObjectMode = false;
	readableAborted = false;
	readableDidRead = false;
	closed = false;
	errored = null;
	readable = false;
	destroyed = false;
	static from(_iterable, options) {
		return new _Readable(options);
	}
	constructor(_opts) {
		super();
	}
	_read(_size) {}
	read(_size) {}
	setEncoding(_encoding) {
		return this;
	}
	pause() {
		return this;
	}
	resume() {
		return this;
	}
	isPaused() {
		return true;
	}
	unpipe(_destination) {
		return this;
	}
	unshift(_chunk, _encoding) {}
	wrap(_oldStream) {
		return this;
	}
	push(_chunk, _encoding) {
		return false;
	}
	_destroy(_error, _callback) {
		this.removeAllListeners();
	}
	destroy(error) {
		this.destroyed = true;
		this._destroy(error);
		return this;
	}
	pipe(_destenition, _options) {
		return {};
	}
	compose(stream, options) {
		throw new Error("[unenv] Method not implemented.");
	}
	[Symbol.asyncDispose]() {
		this.destroy();
		return Promise.resolve();
	}
	async *[Symbol.asyncIterator]() {
		throw /* @__PURE__ */ createNotImplementedError("Readable.asyncIterator");
	}
	iterator(options) {
		throw /* @__PURE__ */ createNotImplementedError("Readable.iterator");
	}
	map(fn, options) {
		throw /* @__PURE__ */ createNotImplementedError("Readable.map");
	}
	filter(fn, options) {
		throw /* @__PURE__ */ createNotImplementedError("Readable.filter");
	}
	forEach(fn, options) {
		throw /* @__PURE__ */ createNotImplementedError("Readable.forEach");
	}
	reduce(fn, initialValue, options) {
		throw /* @__PURE__ */ createNotImplementedError("Readable.reduce");
	}
	find(fn, options) {
		throw /* @__PURE__ */ createNotImplementedError("Readable.find");
	}
	findIndex(fn, options) {
		throw /* @__PURE__ */ createNotImplementedError("Readable.findIndex");
	}
	some(fn, options) {
		throw /* @__PURE__ */ createNotImplementedError("Readable.some");
	}
	toArray(options) {
		throw /* @__PURE__ */ createNotImplementedError("Readable.toArray");
	}
	every(fn, options) {
		throw /* @__PURE__ */ createNotImplementedError("Readable.every");
	}
	flatMap(fn, options) {
		throw /* @__PURE__ */ createNotImplementedError("Readable.flatMap");
	}
	drop(limit, options) {
		throw /* @__PURE__ */ createNotImplementedError("Readable.drop");
	}
	take(limit, options) {
		throw /* @__PURE__ */ createNotImplementedError("Readable.take");
	}
	asIndexedPairs(options) {
		throw /* @__PURE__ */ createNotImplementedError("Readable.asIndexedPairs");
	}
};
const Readable = globalThis.Readable || _Readable;
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/stream/writable.mjs
var _Writable = class extends EventEmitter {
	__unenv__ = true;
	writable = true;
	writableEnded = false;
	writableFinished = false;
	writableHighWaterMark = 0;
	writableLength = 0;
	writableObjectMode = false;
	writableCorked = 0;
	closed = false;
	errored = null;
	writableNeedDrain = false;
	destroyed = false;
	_data;
	_encoding = "utf-8";
	constructor(_opts) {
		super();
	}
	pipe(_destenition, _options) {
		return {};
	}
	_write(chunk, encoding, callback) {
		if (this.writableEnded) {
			if (callback) callback();
			return;
		}
		if (this._data === void 0) this._data = chunk;
		else {
			const a = typeof this._data === "string" ? Buffer.from(this._data, this._encoding || encoding || "utf8") : this._data;
			const b = typeof chunk === "string" ? Buffer.from(chunk, encoding || this._encoding || "utf8") : chunk;
			this._data = Buffer.concat([a, b]);
		}
		this._encoding = encoding;
		if (callback) callback();
	}
	_writev(_chunks, _callback) {}
	_destroy(_error, _callback) {}
	_final(_callback) {}
	write(chunk, arg2, arg3) {
		const encoding = typeof arg2 === "string" ? this._encoding : "utf-8";
		const cb = typeof arg2 === "function" ? arg2 : typeof arg3 === "function" ? arg3 : void 0;
		this._write(chunk, encoding, cb);
		return true;
	}
	setDefaultEncoding(_encoding) {
		return this;
	}
	end(arg1, arg2, arg3) {
		const callback = typeof arg1 === "function" ? arg1 : typeof arg2 === "function" ? arg2 : typeof arg3 === "function" ? arg3 : void 0;
		if (this.writableEnded) {
			if (callback) callback();
			return this;
		}
		const data = arg1 === callback ? void 0 : arg1;
		if (data) {
			const encoding = arg2 === callback ? void 0 : arg2;
			this.write(data, encoding, callback);
		}
		this.writableEnded = true;
		this.writableFinished = true;
		this.emit("close");
		this.emit("finish");
		return this;
	}
	cork() {}
	uncork() {}
	destroy(_error) {
		this.destroyed = true;
		delete this._data;
		this.removeAllListeners();
		return this;
	}
	compose(stream, options) {
		throw new Error("[h3] Method not implemented.");
	}
};
const Writable = globalThis.Writable || _Writable;
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/stream/duplex.mjs
const __Duplex = class {
	allowHalfOpen = true;
	_destroy;
	constructor(readable = new Readable(), writable = new Writable()) {
		Object.assign(this, readable);
		Object.assign(this, writable);
		this._destroy = /* @__PURE__ */ mergeFns(readable._destroy, writable._destroy);
	}
};
function getDuplex() {
	Object.assign(__Duplex.prototype, Readable.prototype);
	Object.assign(__Duplex.prototype, Writable.prototype);
	return __Duplex;
}
const _Duplex = /* @__PURE__ */ getDuplex();
const Duplex = globalThis.Duplex || _Duplex;
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/net/socket.mjs
var Socket = class extends Duplex {
	__unenv__ = true;
	bufferSize = 0;
	bytesRead = 0;
	bytesWritten = 0;
	connecting = false;
	destroyed = false;
	pending = false;
	localAddress = "";
	localPort = 0;
	remoteAddress = "";
	remoteFamily = "";
	remotePort = 0;
	autoSelectFamilyAttemptedAddresses = [];
	readyState = "readOnly";
	constructor(_options) {
		super();
	}
	write(_buffer, _arg1, _arg2) {
		return false;
	}
	connect(_arg1, _arg2, _arg3) {
		return this;
	}
	end(_arg1, _arg2, _arg3) {
		return this;
	}
	setEncoding(_encoding) {
		return this;
	}
	pause() {
		return this;
	}
	resume() {
		return this;
	}
	setTimeout(_timeout, _callback) {
		return this;
	}
	setNoDelay(_noDelay) {
		return this;
	}
	setKeepAlive(_enable, _initialDelay) {
		return this;
	}
	address() {
		return {};
	}
	unref() {
		return this;
	}
	ref() {
		return this;
	}
	destroySoon() {
		this.destroy();
	}
	resetAndDestroy() {
		const err = /* @__PURE__ */ new Error("ERR_SOCKET_CLOSED");
		err.code = "ERR_SOCKET_CLOSED";
		this.destroy(err);
		return this;
	}
};
var SocketAddress = class {
	__unenv__ = true;
	address;
	family;
	port;
	flowlabel;
	static parse(_address, _port) {}
	constructor(options) {
		this.address = options.address;
		this.family = options.family;
		this.port = options.port;
		this.flowlabel = options.flowlabel;
	}
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/net/server.mjs
var Server = class extends EventEmitter {
	__unenv__ = true;
	maxConnections = 1;
	connections = 0;
	listening = false;
	constructor(arg1, arg2) {
		super();
	}
	listen() {
		throw /* @__PURE__ */ createNotImplementedError("node:net.Server.listen()");
	}
	close(callback) {
		throw /* @__PURE__ */ createNotImplementedError("node:net.Server.close()");
	}
	address() {
		return null;
	}
	getConnections(cb) {
		cb(null, 0);
	}
	ref() {
		return this;
	}
	unref() {
		return this;
	}
	[Symbol.asyncDispose]() {
		return Promise.resolve();
	}
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/net.mjs
const createServer = /* @__PURE__ */ notImplemented("net.createServer");
const BlockList = /* @__PURE__ */ notImplementedClass("net.BlockList");
const connect = /* @__PURE__ */ notImplemented("net.connect");
const createConnection = /* @__PURE__ */ notImplemented("net.createConnection");
const getDefaultAutoSelectFamily = /* @__PURE__ */ notImplemented("net.getDefaultAutoSelectFamily");
const setDefaultAutoSelectFamily = /* @__PURE__ */ notImplemented("net.setDefaultAutoSelectFamily");
const getDefaultAutoSelectFamilyAttemptTimeout = /* @__PURE__ */ notImplemented("net.getDefaultAutoSelectFamilyAttemptTimeout");
const setDefaultAutoSelectFamilyAttemptTimeout = /* @__PURE__ */ notImplemented("net.setDefaultAutoSelectFamilyAttemptTimeout");
const IPV4Regex = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const isIPv4 = (host) => IPV4Regex.test(host);
const IPV6Regex = /^([\dA-Fa-f]{1,4}:){7}[\dA-Fa-f]{1,4}$/;
const isIPv6 = (host) => IPV6Regex.test(host);
const isIP = (host) => {
	if (isIPv4(host)) return 4;
	if (isIPv6(host)) return 6;
	return 0;
};
const _createServerHandle = /* @__PURE__ */ notImplemented("net._createServerHandle");
const _normalizeArgs = /* @__PURE__ */ notImplemented("net._normalizeArgs");
const _setSimultaneousAccepts = /* @__PURE__ */ notImplemented("net._setSimultaneousAccepts");
const exports = {
	Socket,
	Stream: Socket,
	Server,
	BlockList,
	SocketAddress,
	createServer,
	connect,
	createConnection,
	isIPv4,
	isIPv6,
	isIP,
	getDefaultAutoSelectFamily,
	getDefaultAutoSelectFamilyAttemptTimeout,
	setDefaultAutoSelectFamily,
	setDefaultAutoSelectFamilyAttemptTimeout,
	_createServerHandle,
	_normalizeArgs,
	_setSimultaneousAccepts
};
//#endregion
export { BlockList, Server, Socket, Socket as Stream, SocketAddress, _createServerHandle, _normalizeArgs, _setSimultaneousAccepts, connect, createConnection, createServer, exports as default, getDefaultAutoSelectFamily, getDefaultAutoSelectFamilyAttemptTimeout, isIP, isIPv4, isIPv6, setDefaultAutoSelectFamily, setDefaultAutoSelectFamilyAttemptTimeout };
