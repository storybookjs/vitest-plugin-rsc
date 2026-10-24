//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
//#region ../../node_modules/.pnpm/events@3.3.0/node_modules/events/events.js
var require_events = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var R = typeof Reflect === "object" ? Reflect : null;
	var ReflectApply = R && typeof R.apply === "function" ? R.apply : function ReflectApply(target, receiver, args) {
		return Function.prototype.apply.call(target, receiver, args);
	};
	var ReflectOwnKeys;
	if (R && typeof R.ownKeys === "function") ReflectOwnKeys = R.ownKeys;
	else if (Object.getOwnPropertySymbols) ReflectOwnKeys = function ReflectOwnKeys(target) {
		return Object.getOwnPropertyNames(target).concat(Object.getOwnPropertySymbols(target));
	};
	else ReflectOwnKeys = function ReflectOwnKeys(target) {
		return Object.getOwnPropertyNames(target);
	};
	function ProcessEmitWarning(warning) {
		if (console && console.warn) console.warn(warning);
	}
	var NumberIsNaN = Number.isNaN || function NumberIsNaN(value) {
		return value !== value;
	};
	function EventEmitter() {
		EventEmitter.init.call(this);
	}
	module.exports = EventEmitter;
	module.exports.once = once;
	EventEmitter.EventEmitter = EventEmitter;
	EventEmitter.prototype._events = void 0;
	EventEmitter.prototype._eventsCount = 0;
	EventEmitter.prototype._maxListeners = void 0;
	var defaultMaxListeners = 10;
	function checkListener(listener) {
		if (typeof listener !== "function") throw new TypeError("The \"listener\" argument must be of type Function. Received type " + typeof listener);
	}
	Object.defineProperty(EventEmitter, "defaultMaxListeners", {
		enumerable: true,
		get: function() {
			return defaultMaxListeners;
		},
		set: function(arg) {
			if (typeof arg !== "number" || arg < 0 || NumberIsNaN(arg)) throw new RangeError("The value of \"defaultMaxListeners\" is out of range. It must be a non-negative number. Received " + arg + ".");
			defaultMaxListeners = arg;
		}
	});
	EventEmitter.init = function() {
		if (this._events === void 0 || this._events === Object.getPrototypeOf(this)._events) {
			this._events = Object.create(null);
			this._eventsCount = 0;
		}
		this._maxListeners = this._maxListeners || void 0;
	};
	EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
		if (typeof n !== "number" || n < 0 || NumberIsNaN(n)) throw new RangeError("The value of \"n\" is out of range. It must be a non-negative number. Received " + n + ".");
		this._maxListeners = n;
		return this;
	};
	function _getMaxListeners(that) {
		if (that._maxListeners === void 0) return EventEmitter.defaultMaxListeners;
		return that._maxListeners;
	}
	EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
		return _getMaxListeners(this);
	};
	EventEmitter.prototype.emit = function emit(type) {
		var args = [];
		for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
		var doError = type === "error";
		var events = this._events;
		if (events !== void 0) doError = doError && events.error === void 0;
		else if (!doError) return false;
		if (doError) {
			var er;
			if (args.length > 0) er = args[0];
			if (er instanceof Error) throw er;
			var err = /* @__PURE__ */ new Error("Unhandled error." + (er ? " (" + er.message + ")" : ""));
			err.context = er;
			throw err;
		}
		var handler = events[type];
		if (handler === void 0) return false;
		if (typeof handler === "function") ReflectApply(handler, this, args);
		else {
			var len = handler.length;
			var listeners = arrayClone(handler, len);
			for (var i = 0; i < len; ++i) ReflectApply(listeners[i], this, args);
		}
		return true;
	};
	function _addListener(target, type, listener, prepend) {
		var m;
		var events;
		var existing;
		checkListener(listener);
		events = target._events;
		if (events === void 0) {
			events = target._events = Object.create(null);
			target._eventsCount = 0;
		} else {
			if (events.newListener !== void 0) {
				target.emit("newListener", type, listener.listener ? listener.listener : listener);
				events = target._events;
			}
			existing = events[type];
		}
		if (existing === void 0) {
			existing = events[type] = listener;
			++target._eventsCount;
		} else {
			if (typeof existing === "function") existing = events[type] = prepend ? [listener, existing] : [existing, listener];
			else if (prepend) existing.unshift(listener);
			else existing.push(listener);
			m = _getMaxListeners(target);
			if (m > 0 && existing.length > m && !existing.warned) {
				existing.warned = true;
				var w = /* @__PURE__ */ new Error("Possible EventEmitter memory leak detected. " + existing.length + " " + String(type) + " listeners added. Use emitter.setMaxListeners() to increase limit");
				w.name = "MaxListenersExceededWarning";
				w.emitter = target;
				w.type = type;
				w.count = existing.length;
				ProcessEmitWarning(w);
			}
		}
		return target;
	}
	EventEmitter.prototype.addListener = function addListener(type, listener) {
		return _addListener(this, type, listener, false);
	};
	EventEmitter.prototype.on = EventEmitter.prototype.addListener;
	EventEmitter.prototype.prependListener = function prependListener(type, listener) {
		return _addListener(this, type, listener, true);
	};
	function onceWrapper() {
		if (!this.fired) {
			this.target.removeListener(this.type, this.wrapFn);
			this.fired = true;
			if (arguments.length === 0) return this.listener.call(this.target);
			return this.listener.apply(this.target, arguments);
		}
	}
	function _onceWrap(target, type, listener) {
		var state = {
			fired: false,
			wrapFn: void 0,
			target,
			type,
			listener
		};
		var wrapped = onceWrapper.bind(state);
		wrapped.listener = listener;
		state.wrapFn = wrapped;
		return wrapped;
	}
	EventEmitter.prototype.once = function once(type, listener) {
		checkListener(listener);
		this.on(type, _onceWrap(this, type, listener));
		return this;
	};
	EventEmitter.prototype.prependOnceListener = function prependOnceListener(type, listener) {
		checkListener(listener);
		this.prependListener(type, _onceWrap(this, type, listener));
		return this;
	};
	EventEmitter.prototype.removeListener = function removeListener(type, listener) {
		var list, events, position, i, originalListener;
		checkListener(listener);
		events = this._events;
		if (events === void 0) return this;
		list = events[type];
		if (list === void 0) return this;
		if (list === listener || list.listener === listener) {
			if (--this._eventsCount === 0) this._events = Object.create(null);
			else {
				delete events[type];
				if (events.removeListener) this.emit("removeListener", type, list.listener || listener);
			}
		} else if (typeof list !== "function") {
			position = -1;
			for (i = list.length - 1; i >= 0; i--) if (list[i] === listener || list[i].listener === listener) {
				originalListener = list[i].listener;
				position = i;
				break;
			}
			if (position < 0) return this;
			if (position === 0) list.shift();
			else spliceOne(list, position);
			if (list.length === 1) events[type] = list[0];
			if (events.removeListener !== void 0) this.emit("removeListener", type, originalListener || listener);
		}
		return this;
	};
	EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
	EventEmitter.prototype.removeAllListeners = function removeAllListeners(type) {
		var listeners, events = this._events, i;
		if (events === void 0) return this;
		if (events.removeListener === void 0) {
			if (arguments.length === 0) {
				this._events = Object.create(null);
				this._eventsCount = 0;
			} else if (events[type] !== void 0) {
				if (--this._eventsCount === 0) this._events = Object.create(null);
				else delete events[type];
			}
			return this;
		}
		if (arguments.length === 0) {
			var keys = Object.keys(events);
			var key;
			for (i = 0; i < keys.length; ++i) {
				key = keys[i];
				if (key === "removeListener") continue;
				this.removeAllListeners(key);
			}
			this.removeAllListeners("removeListener");
			this._events = Object.create(null);
			this._eventsCount = 0;
			return this;
		}
		listeners = events[type];
		if (typeof listeners === "function") this.removeListener(type, listeners);
		else if (listeners !== void 0) for (i = listeners.length - 1; i >= 0; i--) this.removeListener(type, listeners[i]);
		return this;
	};
	function _listeners(target, type, unwrap) {
		var events = target._events;
		if (events === void 0) return [];
		var evlistener = events[type];
		if (evlistener === void 0) return [];
		if (typeof evlistener === "function") return unwrap ? [evlistener.listener || evlistener] : [evlistener];
		return unwrap ? unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
	}
	EventEmitter.prototype.listeners = function listeners(type) {
		return _listeners(this, type, true);
	};
	EventEmitter.prototype.rawListeners = function rawListeners(type) {
		return _listeners(this, type, false);
	};
	EventEmitter.listenerCount = function(emitter, type) {
		if (typeof emitter.listenerCount === "function") return emitter.listenerCount(type);
		else return listenerCount.call(emitter, type);
	};
	EventEmitter.prototype.listenerCount = listenerCount;
	function listenerCount(type) {
		var events = this._events;
		if (events !== void 0) {
			var evlistener = events[type];
			if (typeof evlistener === "function") return 1;
			else if (evlistener !== void 0) return evlistener.length;
		}
		return 0;
	}
	EventEmitter.prototype.eventNames = function eventNames() {
		return this._eventsCount > 0 ? ReflectOwnKeys(this._events) : [];
	};
	function arrayClone(arr, n) {
		var copy = new Array(n);
		for (var i = 0; i < n; ++i) copy[i] = arr[i];
		return copy;
	}
	function spliceOne(list, index) {
		for (; index + 1 < list.length; index++) list[index] = list[index + 1];
		list.pop();
	}
	function unwrapListeners(arr) {
		var ret = new Array(arr.length);
		for (var i = 0; i < ret.length; ++i) ret[i] = arr[i].listener || arr[i];
		return ret;
	}
	function once(emitter, name) {
		return new Promise(function(resolve, reject) {
			function errorListener(err) {
				emitter.removeListener(name, resolver);
				reject(err);
			}
			function resolver() {
				if (typeof emitter.removeListener === "function") emitter.removeListener("error", errorListener);
				resolve([].slice.call(arguments));
			}
			eventTargetAgnosticAddListener(emitter, name, resolver, { once: true });
			if (name !== "error") addErrorHandlerIfEventEmitter(emitter, errorListener, { once: true });
		});
	}
	function addErrorHandlerIfEventEmitter(emitter, handler, flags) {
		if (typeof emitter.on === "function") eventTargetAgnosticAddListener(emitter, "error", handler, flags);
	}
	function eventTargetAgnosticAddListener(emitter, name, listener, flags) {
		if (typeof emitter.on === "function") {
			if (flags.once) emitter.once(name, listener);
			else emitter.on(name, listener);
		} else if (typeof emitter.addEventListener === "function") emitter.addEventListener(name, function wrapListener(arg) {
			if (flags.once) emitter.removeEventListener(name, wrapListener);
			listener(arg);
		});
		else throw new TypeError("The \"emitter\" argument must be of type EventEmitter. Received type " + typeof emitter);
	}
}));
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/async_hooks/async-hook.mjs
const executionAsyncId = function executionAsyncId() {
	return 0;
};
Object.assign(Object.create(null), {
	NONE: 0,
	DIRHANDLE: 1,
	DNSCHANNEL: 2,
	ELDHISTOGRAM: 3,
	FILEHANDLE: 4,
	FILEHANDLECLOSEREQ: 5,
	BLOBREADER: 6,
	FSEVENTWRAP: 7,
	FSREQCALLBACK: 8,
	FSREQPROMISE: 9,
	GETADDRINFOREQWRAP: 10,
	GETNAMEINFOREQWRAP: 11,
	HEAPSNAPSHOT: 12,
	HTTP2SESSION: 13,
	HTTP2STREAM: 14,
	HTTP2PING: 15,
	HTTP2SETTINGS: 16,
	HTTPINCOMINGMESSAGE: 17,
	HTTPCLIENTREQUEST: 18,
	JSSTREAM: 19,
	JSUDPWRAP: 20,
	MESSAGEPORT: 21,
	PIPECONNECTWRAP: 22,
	PIPESERVERWRAP: 23,
	PIPEWRAP: 24,
	PROCESSWRAP: 25,
	PROMISE: 26,
	QUERYWRAP: 27,
	QUIC_ENDPOINT: 28,
	QUIC_LOGSTREAM: 29,
	QUIC_PACKET: 30,
	QUIC_SESSION: 31,
	QUIC_STREAM: 32,
	QUIC_UDP: 33,
	SHUTDOWNWRAP: 34,
	SIGNALWRAP: 35,
	STATWATCHER: 36,
	STREAMPIPE: 37,
	TCPCONNECTWRAP: 38,
	TCPSERVERWRAP: 39,
	TCPWRAP: 40,
	TTYWRAP: 41,
	UDPSENDWRAP: 42,
	UDPWRAP: 43,
	SIGINTWATCHDOG: 44,
	WORKER: 45,
	WORKERHEAPSNAPSHOT: 46,
	WRITEWRAP: 47,
	ZLIB: 48,
	CHECKPRIMEREQUEST: 49,
	PBKDF2REQUEST: 50,
	KEYPAIRGENREQUEST: 51,
	KEYGENREQUEST: 52,
	KEYEXPORTREQUEST: 53,
	CIPHERREQUEST: 54,
	DERIVEBITSREQUEST: 55,
	HASHREQUEST: 56,
	RANDOMBYTESREQUEST: 57,
	RANDOMPRIMEREQUEST: 58,
	SCRYPTREQUEST: 59,
	SIGNREQUEST: 60,
	TLSWRAP: 61,
	VERIFYREQUEST: 62
});
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/async_hooks/async-resource.mjs
let _asyncIdCounter = 100;
var _AsyncResource = class {
	__unenv__ = true;
	type;
	_asyncId;
	_triggerAsyncId;
	constructor(type, triggerAsyncId = executionAsyncId()) {
		this.type = type;
		this._asyncId = -1 * _asyncIdCounter++;
		this._triggerAsyncId = typeof triggerAsyncId === "number" ? triggerAsyncId : triggerAsyncId?.triggerAsyncId;
	}
	static bind(fn, type, thisArg) {
		return new AsyncResource(type ?? "anonymous").bind(fn);
	}
	bind(fn, thisArg) {
		const binded = (...args) => this.runInAsyncScope(fn, thisArg, ...args);
		binded.asyncResource = this;
		return binded;
	}
	runInAsyncScope(fn, thisArg, ...args) {
		return fn.apply(thisArg, args);
	}
	emitDestroy() {
		return this;
	}
	asyncId() {
		return this._asyncId;
	}
	triggerAsyncId() {
		return this._triggerAsyncId;
	}
};
const AsyncResource = globalThis.AsyncResource || _AsyncResource;
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/events/events.mjs
var import_events = /* @__PURE__ */ __toESM(require_events(), 1);
let defaultMaxListeners$1 = 10;
const AsyncIteratorPrototype = Object.getPrototypeOf(Object.getPrototypeOf(async function* () {}).prototype);
const inspect = (value, _opts) => value;
const ERR_INVALID_THIS = Error;
const ERR_UNHANDLED_ERROR = Error;
const ERR_INVALID_ARG_TYPE = Error;
const AbortError = Error;
const genericNodeError = Error;
const kRejection = /* @__PURE__ */ Symbol.for("nodejs.rejection");
const kCapture = /* @__PURE__ */ Symbol.for("kCapture");
const kErrorMonitor = /* @__PURE__ */ Symbol.for("events.errorMonitor");
const kShapeMode = /* @__PURE__ */ Symbol.for("shapeMode");
const kMaxEventTargetListeners = /* @__PURE__ */ Symbol.for("events.maxEventTargetListeners");
const kEnhanceStackBeforeInspector = /* @__PURE__ */ Symbol.for("kEnhanceStackBeforeInspector");
const kWatermarkData = /* @__PURE__ */ Symbol.for("nodejs.watermarkData");
const kEventEmitter = /* @__PURE__ */ Symbol.for("kEventEmitter");
const kAsyncResource = /* @__PURE__ */ Symbol.for("kAsyncResource");
const kFirstEventParam = /* @__PURE__ */ Symbol.for("kFirstEventParam");
const kResistStopPropagation = /* @__PURE__ */ Symbol.for("kResistStopPropagation");
const kMaxEventTargetListenersWarned = /* @__PURE__ */ Symbol.for("events.maxEventTargetListenersWarned");
var _EventEmitter = class _EventEmitter {
	_events = void 0;
	_eventsCount = 0;
	_maxListeners = defaultMaxListeners$1;
	[kCapture] = false;
	[kShapeMode] = false;
	static captureRejectionSymbol = kRejection;
	static errorMonitor = kErrorMonitor;
	static kMaxEventTargetListeners = kMaxEventTargetListeners;
	static kMaxEventTargetListenersWarned = kMaxEventTargetListenersWarned;
	static usingDomains = false;
	static get on() {
		return on;
	}
	static get once() {
		return once$1;
	}
	static get getEventListeners() {
		return getEventListeners;
	}
	static get getMaxListeners() {
		return getMaxListeners;
	}
	static get addAbortListener() {
		return addAbortListener;
	}
	static get EventEmitterAsyncResource() {
		return EventEmitterAsyncResource;
	}
	static get EventEmitter() {
		return _EventEmitter;
	}
	static setMaxListeners(n = defaultMaxListeners$1, ...eventTargets) {
		if (eventTargets.length === 0) defaultMaxListeners$1 = n;
		else for (const target of eventTargets) if (isEventTarget(target)) {
			target[kMaxEventTargetListeners] = n;
			target[kMaxEventTargetListenersWarned] = false;
		} else if (typeof target.setMaxListeners === "function") target.setMaxListeners(n);
		else throw new ERR_INVALID_ARG_TYPE("eventTargets", ["EventEmitter", "EventTarget"], target);
	}
	static listenerCount(emitter, type) {
		if (typeof emitter.listenerCount === "function") return emitter.listenerCount(type);
		_EventEmitter.prototype.listenerCount.call(emitter, type);
	}
	static init() {
		throw new Error("EventEmitter.init() is not implemented.");
	}
	static get captureRejections() {
		return this[kCapture];
	}
	static set captureRejections(value) {
		this[kCapture] = value;
	}
	static get defaultMaxListeners() {
		return defaultMaxListeners$1;
	}
	static set defaultMaxListeners(arg) {
		defaultMaxListeners$1 = arg;
	}
	constructor(opts) {
		if (this._events === void 0 || this._events === Object.getPrototypeOf(this)._events) {
			this._events = { __proto__: null };
			this._eventsCount = 0;
			this[kShapeMode] = false;
		} else this[kShapeMode] = true;
		this._maxListeners = this._maxListeners || void 0;
		if (opts?.captureRejections) this[kCapture] = Boolean(opts.captureRejections);
		else this[kCapture] = _EventEmitter.prototype[kCapture];
	}
	setMaxListeners(n) {
		this._maxListeners = n;
		return this;
	}
	getMaxListeners() {
		return _getMaxListeners(this);
	}
	emit(type, ...args) {
		let doError = type === "error";
		const events = this._events;
		if (events !== void 0) {
			if (doError && events[kErrorMonitor] !== void 0) this.emit(kErrorMonitor, ...args);
			doError = doError && events.error === void 0;
		} else if (!doError) return false;
		if (doError) {
			let er;
			if (args.length > 0) er = args[0];
			if (er instanceof Error) {
				try {
					const capture = {};
					Error.captureStackTrace?.(capture, _EventEmitter.prototype.emit);
					Object.defineProperty(er, kEnhanceStackBeforeInspector, {
						__proto__: null,
						value: Function.prototype.bind(enhanceStackTrace, this, er, capture),
						configurable: true
					});
				} catch {}
				throw er;
			}
			let stringifiedEr;
			try {
				stringifiedEr = inspect(er);
			} catch {
				stringifiedEr = er;
			}
			const err = new ERR_UNHANDLED_ERROR(stringifiedEr);
			err.context = er;
			throw err;
		}
		const handler = events[type];
		if (handler === void 0) return false;
		if (typeof handler === "function") {
			const result = handler.apply(this, args);
			if (result !== void 0 && result !== null) addCatch(this, result, type, args);
		} else {
			const len = handler.length;
			const listeners = arrayClone(handler);
			for (let i = 0; i < len; ++i) {
				const result = listeners[i].apply(this, args);
				if (result !== void 0 && result !== null) addCatch(this, result, type, args);
			}
		}
		return true;
	}
	addListener(type, listener) {
		_addListener(this, type, listener, false);
		return this;
	}
	on(type, listener) {
		return this.addListener(type, listener);
	}
	prependListener(type, listener) {
		_addListener(this, type, listener, true);
		return this;
	}
	once(type, listener) {
		this.on(type, _onceWrap(this, type, listener));
		return this;
	}
	prependOnceListener(type, listener) {
		this.prependListener(type, _onceWrap(this, type, listener));
		return this;
	}
	removeListener(type, listener) {
		const events = this._events;
		if (events === void 0) return this;
		const list = events[type];
		if (list === void 0) return this;
		if (list === listener || list.listener === listener) {
			this._eventsCount -= 1;
			if (this[kShapeMode]) events[type] = void 0;
			else if (this._eventsCount === 0) this._events = { __proto__: null };
			else {
				delete events[type];
				if (events.removeListener) this.emit("removeListener", type, list.listener || listener);
			}
		} else if (typeof list !== "function") {
			let position = -1;
			for (let i = list.length - 1; i >= 0; i--) if (list[i] === listener || list[i].listener === listener) {
				position = i;
				break;
			}
			if (position < 0) return this;
			if (position === 0) list.shift();
			else spliceOne(list, position);
			if (list.length === 1) events[type] = list[0];
			if (events.removeListener !== void 0) this.emit("removeListener", type, listener);
		}
		return this;
	}
	off(type, listener) {
		return this.removeListener(type, listener);
	}
	removeAllListeners(type) {
		const events = this._events;
		if (events === void 0) return this;
		if (events.removeListener === void 0) {
			if (arguments.length === 0) {
				this._events = { __proto__: null };
				this._eventsCount = 0;
			} else if (events[type] !== void 0) {
				if (--this._eventsCount === 0) this._events = { __proto__: null };
				else delete events[type];
			}
			this[kShapeMode] = false;
			return this;
		}
		if (arguments.length === 0) {
			for (const key of Reflect.ownKeys(events)) {
				if (key === "removeListener") continue;
				this.removeAllListeners(key);
			}
			this.removeAllListeners("removeListener");
			this._events = { __proto__: null };
			this._eventsCount = 0;
			this[kShapeMode] = false;
			return this;
		}
		const listeners = events[type];
		if (typeof listeners === "function") this.removeListener(type, listeners);
		else if (listeners !== void 0) for (let i = listeners.length - 1; i >= 0; i--) this.removeListener(type, listeners[i]);
		return this;
	}
	listeners(type) {
		return _listeners(this, type, true);
	}
	rawListeners(type) {
		return _listeners(this, type, false);
	}
	eventNames() {
		return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
	}
	listenerCount(eventName, listener) {
		const events = this._events;
		if (events !== void 0) {
			const evlistener = events[eventName];
			if (typeof evlistener === "function") {
				if (listener != null) return listener === evlistener || listener === evlistener.listener ? 1 : 0;
				return 1;
			} else if (evlistener !== void 0) {
				if (listener != null) {
					let matching = 0;
					for (let i = 0, l = evlistener.length; i < l; i++) if (evlistener[i] === listener || evlistener[i].listener === listener) matching++;
					return matching;
				}
				return evlistener.length;
			}
		}
		return 0;
	}
};
var EventEmitterAsyncResource = class extends _EventEmitter {
	constructor(options) {
		let name;
		if (typeof options === "string") {
			name = options;
			options = void 0;
		} else name = options?.name || new.target.name;
		super(options);
		this[kAsyncResource] = new EventEmitterReferencingAsyncResource(this, name, options);
	}
	emit(event, ...args) {
		if (this[kAsyncResource] === void 0) throw new ERR_INVALID_THIS("EventEmitterAsyncResource");
		const { asyncResource } = this;
		Array.prototype.unshift(args, super.emit, this, event);
		return Reflect.apply(asyncResource.runInAsyncScope, asyncResource, args);
	}
	emitDestroy() {
		if (this[kAsyncResource] === void 0) throw new ERR_INVALID_THIS("EventEmitterAsyncResource");
		this.asyncResource.emitDestroy();
	}
	get asyncId() {
		if (this[kAsyncResource] === void 0) throw new ERR_INVALID_THIS("EventEmitterAsyncResource");
		return this.asyncResource.asyncId();
	}
	get triggerAsyncId() {
		if (this[kAsyncResource] === void 0) throw new ERR_INVALID_THIS("EventEmitterAsyncResource");
		return this.asyncResource.triggerAsyncId();
	}
	get asyncResource() {
		if (this[kAsyncResource] === void 0) throw new ERR_INVALID_THIS("EventEmitterAsyncResource");
		return this[kAsyncResource];
	}
};
var EventEmitterReferencingAsyncResource = class extends AsyncResource {
	constructor(ee, type, options) {
		super(type, options);
		this[kEventEmitter] = ee;
	}
	get eventEmitter() {
		if (this[kEventEmitter] === void 0) throw new ERR_INVALID_THIS("EventEmitterReferencingAsyncResource");
		return this[kEventEmitter];
	}
};
const on = function on(emitter, event, options = {}) {
	const signal = options.signal;
	if (signal?.aborted) throw new AbortError(void 0, { cause: signal?.reason });
	const highWatermark = options.highWaterMark ?? options.highWatermark ?? Number.MAX_SAFE_INTEGER;
	const lowWatermark = options.lowWaterMark ?? options.lowWatermark ?? 1;
	const unconsumedEvents = new FixedQueue();
	const unconsumedPromises = new FixedQueue();
	let paused = false;
	let error = null;
	let finished = false;
	let size = 0;
	const iterator = Object.setPrototypeOf({
		next() {
			if (size) {
				const value = unconsumedEvents.shift();
				size--;
				if (paused && size < lowWatermark) {
					emitter.resume?.();
					paused = false;
				}
				return Promise.resolve(createIterResult(value, false));
			}
			if (error) {
				const p = Promise.reject(error);
				error = null;
				return p;
			}
			if (finished) return closeHandler();
			return new Promise(function(resolve, reject) {
				unconsumedPromises.push({
					resolve,
					reject
				});
			});
		},
		return() {
			return closeHandler();
		},
		throw(err) {
			if (!err || !(err instanceof Error)) throw new ERR_INVALID_ARG_TYPE("EventEmitter.AsyncIterator", "Error", err);
			errorHandler(err);
		},
		[Symbol.asyncIterator]() {
			return this;
		},
		[kWatermarkData]: {
			get size() {
				return size;
			},
			get low() {
				return lowWatermark;
			},
			get high() {
				return highWatermark;
			},
			get isPaused() {
				return paused;
			}
		}
	}, AsyncIteratorPrototype);
	const { addEventListener, removeAll } = listenersController();
	addEventListener(emitter, event, options[kFirstEventParam] ? eventHandler : function(...args) {
		return eventHandler(args);
	});
	if (event !== "error" && typeof emitter.on === "function") addEventListener(emitter, "error", errorHandler);
	const closeEvents = options?.close;
	if (closeEvents?.length) for (const closeEvent of closeEvents) addEventListener(emitter, closeEvent, closeHandler);
	const abortListenerDisposable = signal ? addAbortListener(signal, abortListener) : null;
	return iterator;
	function abortListener() {
		errorHandler(new AbortError(void 0, { cause: signal?.reason }));
	}
	function eventHandler(value) {
		if (unconsumedPromises.isEmpty()) {
			size++;
			if (!paused && size > highWatermark) {
				paused = true;
				emitter.pause?.();
			}
			unconsumedEvents.push(value);
		} else unconsumedPromises.shift().resolve(createIterResult(value, false));
	}
	function errorHandler(err) {
		if (unconsumedPromises.isEmpty()) error = err;
		else unconsumedPromises.shift().reject(err);
		closeHandler();
	}
	function closeHandler() {
		abortListenerDisposable?.[Symbol.dispose]();
		removeAll();
		finished = true;
		const doneResult = createIterResult(void 0, true);
		while (!unconsumedPromises.isEmpty()) unconsumedPromises.shift().resolve(doneResult);
		return Promise.resolve(doneResult);
	}
};
const once$1 = async function once(emitter, name, options = {}) {
	const signal = options?.signal;
	if (signal?.aborted) throw new AbortError(void 0, { cause: signal?.reason });
	return new Promise((resolve, reject) => {
		const errorListener = (err) => {
			if (typeof emitter.removeListener === "function") emitter.removeListener(name, resolver);
			if (signal != null) eventTargetAgnosticRemoveListener(signal, "abort", abortListener);
			reject(err);
		};
		const resolver = (...args) => {
			if (typeof emitter.removeListener === "function") emitter.removeListener("error", errorListener);
			if (signal != null) eventTargetAgnosticRemoveListener(signal, "abort", abortListener);
			resolve(args);
		};
		eventTargetAgnosticAddListener(emitter, name, resolver, {
			__proto__: null,
			once: true,
			[kResistStopPropagation]: true
		});
		if (name !== "error" && typeof emitter.once === "function") emitter.once("error", errorListener);
		function abortListener() {
			eventTargetAgnosticRemoveListener(emitter, name, resolver);
			eventTargetAgnosticRemoveListener(emitter, "error", errorListener);
			reject(new AbortError(void 0, { cause: signal?.reason }));
		}
		if (signal != null) eventTargetAgnosticAddListener(signal, "abort", abortListener, {
			__proto__: null,
			once: true,
			[kResistStopPropagation]: true
		});
	});
};
const addAbortListener = function addAbortListener(signal, listener) {
	if (signal === void 0) throw new ERR_INVALID_ARG_TYPE("signal", "AbortSignal", signal);
	let removeEventListener;
	if (signal.aborted) queueMicrotask(() => listener());
	else {
		signal.addEventListener("abort", listener, {
			__proto__: null,
			once: true,
			[kResistStopPropagation]: true
		});
		removeEventListener = () => {
			signal.removeEventListener("abort", listener);
		};
	}
	return {
		__proto__: null,
		[Symbol.dispose]() {
			removeEventListener?.();
		}
	};
};
const getEventListeners = function getEventListeners(emitterOrTarget, type) {
	if (typeof emitterOrTarget.listeners === "function") return emitterOrTarget.listeners(type);
	if (isEventTarget(emitterOrTarget)) {
		const root = emitterOrTarget[kEvents].get(type);
		const listeners = [];
		let handler = root?.next;
		while (handler?.listener !== void 0) {
			const listener = handler.listener?.deref ? handler.listener.deref() : handler.listener;
			listeners.push(listener);
			handler = handler.next;
		}
		return listeners;
	}
	throw new ERR_INVALID_ARG_TYPE("emitter", ["EventEmitter", "EventTarget"], emitterOrTarget);
};
const getMaxListeners = function getMaxListeners(emitterOrTarget) {
	if (typeof emitterOrTarget?.getMaxListeners === "function") return _getMaxListeners(emitterOrTarget);
	else if (emitterOrTarget?.[kMaxEventTargetListeners]) return emitterOrTarget[kMaxEventTargetListeners];
	throw new ERR_INVALID_ARG_TYPE("emitter", ["EventEmitter", "EventTarget"], emitterOrTarget);
};
const kSize = 2048;
const kMask = 2047;
var FixedCircularBuffer = class {
	bottom;
	top;
	list;
	next;
	constructor() {
		this.bottom = 0;
		this.top = 0;
		this.list = new Array(kSize);
		this.next = null;
	}
	isEmpty() {
		return this.top === this.bottom;
	}
	isFull() {
		return (this.top + 1 & kMask) === this.bottom;
	}
	push(data) {
		this.list[this.top] = data;
		this.top = this.top + 1 & kMask;
	}
	shift() {
		const nextItem = this.list[this.bottom];
		if (nextItem === void 0) return null;
		this.list[this.bottom] = void 0;
		this.bottom = this.bottom + 1 & kMask;
		return nextItem;
	}
};
var FixedQueue = class {
	head;
	tail;
	constructor() {
		this.head = this.tail = new FixedCircularBuffer();
	}
	isEmpty() {
		return this.head.isEmpty();
	}
	push(data) {
		if (this.head.isFull()) this.head = this.head.next = new FixedCircularBuffer();
		this.head.push(data);
	}
	shift() {
		const tail = this.tail;
		const next = tail.shift();
		if (tail.isEmpty() && tail.next !== null) {
			this.tail = tail.next;
			tail.next = null;
		}
		return next;
	}
};
function isEventTarget(emitter) {
	return typeof emitter?.addEventListener === "function";
}
function addCatch(that, promise, type, args) {
	if (!that[kCapture]) return;
	try {
		const then = promise.then;
		if (typeof then === "function") then.call(promise, void 0, function(err) {
			setTimeout(emitUnhandledRejectionOrErr, 0, that, err, type, args);
		});
	} catch (error_) {
		that.emit("error", error_);
	}
}
function emitUnhandledRejectionOrErr(ee, err, type, args) {
	if (typeof ee[kRejection] === "function") ee[kRejection](err, type, ...args);
	else {
		const prev = ee[kCapture];
		try {
			ee[kCapture] = false;
			ee.emit("error", err);
		} finally {
			ee[kCapture] = prev;
		}
	}
}
function _getMaxListeners(that) {
	if (that._maxListeners === void 0) return defaultMaxListeners$1;
	return that._maxListeners;
}
function enhanceStackTrace(err, own) {
	let ctorInfo = "";
	try {
		const { name } = this.constructor;
		if (name !== "EventEmitter") ctorInfo = ` on ${name} instance`;
	} catch {}
	const sep = `\nEmitted 'error' event${ctorInfo} at:\n`;
	const ownStack = (own.stack || "").split("\n").slice(1);
	return err.stack + sep + ownStack.join("\n");
}
function _addListener(target, type, listener, prepend) {
	let m;
	let events;
	let existing;
	events = target._events;
	if (events === void 0) {
		events = target._events = { __proto__: null };
		target._eventsCount = 0;
	} else {
		if (events.newListener !== void 0) {
			target.emit("newListener", type, listener.listener ?? listener);
			events = target._events;
		}
		existing = events[type];
	}
	if (existing === void 0) {
		events[type] = listener;
		++target._eventsCount;
	} else {
		if (typeof existing === "function") existing = events[type] = prepend ? [listener, existing] : [existing, listener];
		else if (prepend) existing.unshift(listener);
		else existing.push(listener);
		m = _getMaxListeners(target);
		if (m > 0 && existing.length > m && !existing.warned) {
			existing.warned = true;
			const w = new genericNodeError(`Possible EventEmitter memory leak detected. ${existing.length} ${String(type)} listeners added to ${inspect(target, { depth: -1 })}. MaxListeners is ${m}. Use emitter.setMaxListeners() to increase limit`, {
				name: "MaxListenersExceededWarning",
				emitter: target,
				type,
				count: existing.length
			});
			console.warn(w);
		}
	}
	return target;
}
function onceWrapper() {
	if (!this.fired) {
		this.target.removeListener(this.type, this.wrapFn);
		this.fired = true;
		if (arguments.length === 0) return this.listener.call(this.target);
		return this.listener.apply(this.target, arguments);
	}
}
function _onceWrap(target, type, listener) {
	const state = {
		fired: false,
		wrapFn: void 0,
		target,
		type,
		listener
	};
	const wrapped = onceWrapper.bind(state);
	wrapped.listener = listener;
	state.wrapFn = wrapped;
	return wrapped;
}
function _listeners(target, type, unwrap) {
	const events = target._events;
	if (events === void 0) return [];
	const evlistener = events[type];
	if (evlistener === void 0) return [];
	if (typeof evlistener === "function") return unwrap ? [evlistener.listener || evlistener] : [evlistener];
	return unwrap ? unwrapListeners(evlistener) : arrayClone(evlistener);
}
function arrayClone(arr) {
	switch (arr.length) {
		case 2: return [arr[0], arr[1]];
		case 3: return [
			arr[0],
			arr[1],
			arr[2]
		];
		case 4: return [
			arr[0],
			arr[1],
			arr[2],
			arr[3]
		];
		case 5: return [
			arr[0],
			arr[1],
			arr[2],
			arr[3],
			arr[4]
		];
		case 6: return [
			arr[0],
			arr[1],
			arr[2],
			arr[3],
			arr[4],
			arr[5]
		];
	}
	return Array.prototype.slice.call(arr);
}
function unwrapListeners(arr) {
	const ret = arrayClone(arr);
	for (let i = 0; i < ret.length; ++i) {
		const orig = ret[i].listener;
		if (typeof orig === "function") ret[i] = orig;
	}
	return ret;
}
function createIterResult(value, done) {
	return {
		value,
		done
	};
}
function eventTargetAgnosticRemoveListener(emitter, name, listener, flags) {
	if (typeof emitter.removeListener === "function") emitter.removeListener(name, listener);
	else if (typeof emitter.removeEventListener === "function") emitter.removeEventListener(name, listener, flags);
	else throw new ERR_INVALID_ARG_TYPE("emitter", "EventEmitter", emitter);
}
function eventTargetAgnosticAddListener(emitter, name, listener, flags) {
	if (typeof emitter.on === "function") {
		if (flags?.once) emitter.once(name, listener);
		else emitter.on(name, listener);
	} else if (typeof emitter.addEventListener === "function") emitter.addEventListener(name, listener, flags);
	else throw new ERR_INVALID_ARG_TYPE("emitter", "EventEmitter", emitter);
}
function listenersController() {
	const listeners = [];
	return {
		addEventListener(emitter, event, handler, flags) {
			eventTargetAgnosticAddListener(emitter, event, handler, flags);
			Array.prototype.push(listeners, [
				emitter,
				event,
				handler,
				flags
			]);
		},
		removeAll() {
			while (listeners.length > 0) Reflect.apply(eventTargetAgnosticRemoveListener, void 0, listeners.pop());
		}
	};
}
function spliceOne(list, index) {
	for (; index + 1 < list.length; index++) list[index] = list[index + 1];
	list.pop();
}
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
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/events.mjs
const usingDomains = false;
const captureRejectionSymbol = /* @__PURE__ */ Symbol.for("nodejs.rejection");
const captureRejections = false;
const errorMonitor = /* @__PURE__ */ Symbol.for("events.errorMonitor");
const defaultMaxListeners = 10;
const setMaxListeners = /* @__PURE__ */ notImplemented("node:events.setMaxListeners");
const listenerCount = /* @__PURE__ */ notImplemented("node:events.listenerCount");
const init = /* @__PURE__ */ notImplemented("node:events.init");
//#endregion
//#region src/node/events.ts
var events_default = import_events.default;
const { once } = import_events.default;
//#endregion
var EventEmitter = import_events.default;
export { EventEmitter, EventEmitterAsyncResource, addAbortListener, captureRejectionSymbol, captureRejections, events_default as default, defaultMaxListeners, errorMonitor, getEventListeners, getMaxListeners, init, listenerCount, on, once, setMaxListeners, usingDomains };
