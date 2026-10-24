import * as m$3 from "buffer";
import * as m$2 from "events";
import * as m$1 from "process";
import * as m from "string_decoder";
//#region \0rolldown/runtime.js
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
//#endregion
//#region \0require-as-import:buffer
var require__require_as_import_buffer = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = m$3.default;
}));
//#endregion
//#region ../../node_modules/.pnpm/readable-stream@4.8.0/node_modules/readable-stream/lib/ours/primordials.js
var require_primordials = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var AggregateError = class extends Error {
		constructor(errors) {
			if (!Array.isArray(errors)) throw new TypeError(`Expected input to be an Array, got ${typeof errors}`);
			let message = "";
			for (let i = 0; i < errors.length; i++) message += `    ${errors[i].stack}\n`;
			super(message);
			this.name = "AggregateError";
			this.errors = errors;
		}
	};
	module.exports = {
		AggregateError,
		ArrayIsArray(self) {
			return Array.isArray(self);
		},
		ArrayPrototypeIncludes(self, el) {
			return self.includes(el);
		},
		ArrayPrototypeIndexOf(self, el) {
			return self.indexOf(el);
		},
		ArrayPrototypeJoin(self, sep) {
			return self.join(sep);
		},
		ArrayPrototypeMap(self, fn) {
			return self.map(fn);
		},
		ArrayPrototypePop(self, el) {
			return self.pop(el);
		},
		ArrayPrototypePush(self, el) {
			return self.push(el);
		},
		ArrayPrototypeSlice(self, start, end) {
			return self.slice(start, end);
		},
		Error,
		FunctionPrototypeCall(fn, thisArgs, ...args) {
			return fn.call(thisArgs, ...args);
		},
		FunctionPrototypeSymbolHasInstance(self, instance) {
			return Function.prototype[Symbol.hasInstance].call(self, instance);
		},
		MathFloor: Math.floor,
		Number,
		NumberIsInteger: Number.isInteger,
		NumberIsNaN: Number.isNaN,
		NumberMAX_SAFE_INTEGER: Number.MAX_SAFE_INTEGER,
		NumberMIN_SAFE_INTEGER: Number.MIN_SAFE_INTEGER,
		NumberParseInt: Number.parseInt,
		ObjectDefineProperties(self, props) {
			return Object.defineProperties(self, props);
		},
		ObjectDefineProperty(self, name, prop) {
			return Object.defineProperty(self, name, prop);
		},
		ObjectGetOwnPropertyDescriptor(self, name) {
			return Object.getOwnPropertyDescriptor(self, name);
		},
		ObjectKeys(obj) {
			return Object.keys(obj);
		},
		ObjectSetPrototypeOf(target, proto) {
			return Object.setPrototypeOf(target, proto);
		},
		Promise,
		PromisePrototypeCatch(self, fn) {
			return self.catch(fn);
		},
		PromisePrototypeThen(self, thenFn, catchFn) {
			return self.then(thenFn, catchFn);
		},
		PromiseReject(err) {
			return Promise.reject(err);
		},
		PromiseResolve(val) {
			return Promise.resolve(val);
		},
		ReflectApply: Reflect.apply,
		RegExpPrototypeTest(self, value) {
			return self.test(value);
		},
		SafeSet: Set,
		String,
		StringPrototypeSlice(self, start, end) {
			return self.slice(start, end);
		},
		StringPrototypeToLowerCase(self) {
			return self.toLowerCase();
		},
		StringPrototypeToUpperCase(self) {
			return self.toUpperCase();
		},
		StringPrototypeTrim(self) {
			return self.trim();
		},
		Symbol,
		SymbolFor: Symbol.for,
		SymbolAsyncIterator: Symbol.asyncIterator,
		SymbolHasInstance: Symbol.hasInstance,
		SymbolIterator: Symbol.iterator,
		SymbolDispose: Symbol.dispose || Symbol("Symbol.dispose"),
		SymbolAsyncDispose: Symbol.asyncDispose || Symbol("Symbol.asyncDispose"),
		TypedArrayPrototypeSet(self, buf, len) {
			return self.set(buf, len);
		},
		Boolean,
		Uint8Array
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/readable-stream@4.8.0/node_modules/readable-stream/lib/ours/util/inspect.js
var require_inspect = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		format(format, ...args) {
			return format.replace(/%([sdifj])/g, function(...[_unused, type]) {
				const replacement = args.shift();
				if (type === "f") return replacement.toFixed(6);
				else if (type === "j") return JSON.stringify(replacement);
				else if (type === "s" && typeof replacement === "object") return `${replacement.constructor !== Object ? replacement.constructor.name : ""} {}`.trim();
				else return replacement.toString();
			});
		},
		inspect(value) {
			switch (typeof value) {
				case "string":
					if (value.includes("'")) {
						if (!value.includes("\"")) return `"${value}"`;
						else if (!value.includes("`") && !value.includes("${")) return `\`${value}\``;
					}
					return `'${value}'`;
				case "number":
					if (isNaN(value)) return "NaN";
					else if (Object.is(value, -0)) return String(value);
					return value;
				case "bigint": return `${String(value)}n`;
				case "boolean":
				case "undefined": return String(value);
				case "object": return "{}";
			}
		}
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/readable-stream@4.8.0/node_modules/readable-stream/lib/ours/errors.js
var require_errors = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { format, inspect } = require_inspect();
	const { AggregateError: CustomAggregateError } = require_primordials();
	const AggregateError = globalThis.AggregateError || CustomAggregateError;
	const kIsNodeError = Symbol("kIsNodeError");
	const kTypes = [
		"string",
		"function",
		"number",
		"object",
		"Function",
		"Object",
		"boolean",
		"bigint",
		"symbol"
	];
	const classRegExp = /^([A-Z][a-z0-9]*)+$/;
	const nodeInternalPrefix = "__node_internal_";
	const codes = {};
	function assert(value, message) {
		if (!value) throw new codes.ERR_INTERNAL_ASSERTION(message);
	}
	function addNumericalSeparator(val) {
		let res = "";
		let i = val.length;
		const start = val[0] === "-" ? 1 : 0;
		for (; i >= start + 4; i -= 3) res = `_${val.slice(i - 3, i)}${res}`;
		return `${val.slice(0, i)}${res}`;
	}
	function getMessage(key, msg, args) {
		if (typeof msg === "function") {
			assert(msg.length <= args.length, `Code: ${key}; The provided arguments length (${args.length}) does not match the required ones (${msg.length}).`);
			return msg(...args);
		}
		const expectedLength = (msg.match(/%[dfijoOs]/g) || []).length;
		assert(expectedLength === args.length, `Code: ${key}; The provided arguments length (${args.length}) does not match the required ones (${expectedLength}).`);
		if (args.length === 0) return msg;
		return format(msg, ...args);
	}
	function E(code, message, Base) {
		if (!Base) Base = Error;
		class NodeError extends Base {
			constructor(...args) {
				super(getMessage(code, message, args));
			}
			toString() {
				return `${this.name} [${code}]: ${this.message}`;
			}
		}
		Object.defineProperties(NodeError.prototype, {
			name: {
				value: Base.name,
				writable: true,
				enumerable: false,
				configurable: true
			},
			toString: {
				value() {
					return `${this.name} [${code}]: ${this.message}`;
				},
				writable: true,
				enumerable: false,
				configurable: true
			}
		});
		NodeError.prototype.code = code;
		NodeError.prototype[kIsNodeError] = true;
		codes[code] = NodeError;
	}
	function hideStackFrames(fn) {
		const hidden = nodeInternalPrefix + fn.name;
		Object.defineProperty(fn, "name", { value: hidden });
		return fn;
	}
	function aggregateTwoErrors(innerError, outerError) {
		if (innerError && outerError && innerError !== outerError) {
			if (Array.isArray(outerError.errors)) {
				outerError.errors.push(innerError);
				return outerError;
			}
			const err = new AggregateError([outerError, innerError], outerError.message);
			err.code = outerError.code;
			return err;
		}
		return innerError || outerError;
	}
	var AbortError = class extends Error {
		constructor(message = "The operation was aborted", options = void 0) {
			if (options !== void 0 && typeof options !== "object") throw new codes.ERR_INVALID_ARG_TYPE("options", "Object", options);
			super(message, options);
			this.code = "ABORT_ERR";
			this.name = "AbortError";
		}
	};
	E("ERR_ASSERTION", "%s", Error);
	E("ERR_INVALID_ARG_TYPE", (name, expected, actual) => {
		assert(typeof name === "string", "'name' must be a string");
		if (!Array.isArray(expected)) expected = [expected];
		let msg = "The ";
		if (name.endsWith(" argument")) msg += `${name} `;
		else msg += `"${name}" ${name.includes(".") ? "property" : "argument"} `;
		msg += "must be ";
		const types = [];
		const instances = [];
		const other = [];
		for (const value of expected) {
			assert(typeof value === "string", "All expected entries have to be of type string");
			if (kTypes.includes(value)) types.push(value.toLowerCase());
			else if (classRegExp.test(value)) instances.push(value);
			else {
				assert(value !== "object", "The value \"object\" should be written as \"Object\"");
				other.push(value);
			}
		}
		if (instances.length > 0) {
			const pos = types.indexOf("object");
			if (pos !== -1) {
				types.splice(types, pos, 1);
				instances.push("Object");
			}
		}
		if (types.length > 0) {
			switch (types.length) {
				case 1:
					msg += `of type ${types[0]}`;
					break;
				case 2:
					msg += `one of type ${types[0]} or ${types[1]}`;
					break;
				default: {
					const last = types.pop();
					msg += `one of type ${types.join(", ")}, or ${last}`;
				}
			}
			if (instances.length > 0 || other.length > 0) msg += " or ";
		}
		if (instances.length > 0) {
			switch (instances.length) {
				case 1:
					msg += `an instance of ${instances[0]}`;
					break;
				case 2:
					msg += `an instance of ${instances[0]} or ${instances[1]}`;
					break;
				default: {
					const last = instances.pop();
					msg += `an instance of ${instances.join(", ")}, or ${last}`;
				}
			}
			if (other.length > 0) msg += " or ";
		}
		switch (other.length) {
			case 0: break;
			case 1:
				if (other[0].toLowerCase() !== other[0]) msg += "an ";
				msg += `${other[0]}`;
				break;
			case 2:
				msg += `one of ${other[0]} or ${other[1]}`;
				break;
			default: {
				const last = other.pop();
				msg += `one of ${other.join(", ")}, or ${last}`;
			}
		}
		if (actual == null) msg += `. Received ${actual}`;
		else if (typeof actual === "function" && actual.name) msg += `. Received function ${actual.name}`;
		else if (typeof actual === "object") {
			var _actual$constructor;
			if ((_actual$constructor = actual.constructor) !== null && _actual$constructor !== void 0 && _actual$constructor.name) msg += `. Received an instance of ${actual.constructor.name}`;
			else {
				const inspected = inspect(actual, { depth: -1 });
				msg += `. Received ${inspected}`;
			}
		} else {
			let inspected = inspect(actual, { colors: false });
			if (inspected.length > 25) inspected = `${inspected.slice(0, 25)}...`;
			msg += `. Received type ${typeof actual} (${inspected})`;
		}
		return msg;
	}, TypeError);
	E("ERR_INVALID_ARG_VALUE", (name, value, reason = "is invalid") => {
		let inspected = inspect(value);
		if (inspected.length > 128) inspected = inspected.slice(0, 128) + "...";
		return `The ${name.includes(".") ? "property" : "argument"} '${name}' ${reason}. Received ${inspected}`;
	}, TypeError);
	E("ERR_INVALID_RETURN_VALUE", (input, name, value) => {
		var _value$constructor;
		return `Expected ${input} to be returned from the "${name}" function but got ${value !== null && value !== void 0 && (_value$constructor = value.constructor) !== null && _value$constructor !== void 0 && _value$constructor.name ? `instance of ${value.constructor.name}` : `type ${typeof value}`}.`;
	}, TypeError);
	E("ERR_MISSING_ARGS", (...args) => {
		assert(args.length > 0, "At least one arg needs to be specified");
		let msg;
		const len = args.length;
		args = (Array.isArray(args) ? args : [args]).map((a) => `"${a}"`).join(" or ");
		switch (len) {
			case 1:
				msg += `The ${args[0]} argument`;
				break;
			case 2:
				msg += `The ${args[0]} and ${args[1]} arguments`;
				break;
			default: {
				const last = args.pop();
				msg += `The ${args.join(", ")}, and ${last} arguments`;
			}
		}
		return `${msg} must be specified`;
	}, TypeError);
	E("ERR_OUT_OF_RANGE", (str, range, input) => {
		assert(range, "Missing \"range\" argument");
		let received;
		if (Number.isInteger(input) && Math.abs(input) > 2 ** 32) received = addNumericalSeparator(String(input));
		else if (typeof input === "bigint") {
			received = String(input);
			const limit = BigInt(2) ** BigInt(32);
			if (input > limit || input < -limit) received = addNumericalSeparator(received);
			received += "n";
		} else received = inspect(input);
		return `The value of "${str}" is out of range. It must be ${range}. Received ${received}`;
	}, RangeError);
	E("ERR_MULTIPLE_CALLBACK", "Callback called multiple times", Error);
	E("ERR_METHOD_NOT_IMPLEMENTED", "The %s method is not implemented", Error);
	E("ERR_STREAM_ALREADY_FINISHED", "Cannot call %s after a stream was finished", Error);
	E("ERR_STREAM_CANNOT_PIPE", "Cannot pipe, not readable", Error);
	E("ERR_STREAM_DESTROYED", "Cannot call %s after a stream was destroyed", Error);
	E("ERR_STREAM_NULL_VALUES", "May not write null values to stream", TypeError);
	E("ERR_STREAM_PREMATURE_CLOSE", "Premature close", Error);
	E("ERR_STREAM_PUSH_AFTER_EOF", "stream.push() after EOF", Error);
	E("ERR_STREAM_UNSHIFT_AFTER_END_EVENT", "stream.unshift() after end event", Error);
	E("ERR_STREAM_WRITE_AFTER_END", "write after end", Error);
	E("ERR_UNKNOWN_ENCODING", "Unknown encoding: %s", TypeError);
	module.exports = {
		AbortError,
		aggregateTwoErrors: hideStackFrames(aggregateTwoErrors),
		hideStackFrames,
		codes
	};
}));
//#endregion
//#region \0empty-module
var require__empty_module = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {};
}));
//#endregion
//#region \0require-as-import:events
var require__require_as_import_events = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = m$2.default;
}));
//#endregion
//#region ../../node_modules/.pnpm/readable-stream@4.8.0/node_modules/readable-stream/lib/ours/util.js
var require_util = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const bufferModule = require__require_as_import_buffer();
	const { format, inspect } = require_inspect();
	const { codes: { ERR_INVALID_ARG_TYPE } } = require_errors();
	const { kResistStopPropagation, AggregateError, SymbolDispose } = require_primordials();
	const AbortSignal = globalThis.AbortSignal || require__empty_module().AbortSignal;
	const AbortController = globalThis.AbortController || require__empty_module().AbortController;
	const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
	const Blob = globalThis.Blob || bufferModule.Blob;
	const isBlob = typeof Blob !== "undefined" ? function isBlob(b) {
		return b instanceof Blob;
	} : function isBlob(b) {
		return false;
	};
	const validateAbortSignal = (signal, name) => {
		if (signal !== void 0 && (signal === null || typeof signal !== "object" || !("aborted" in signal))) throw new ERR_INVALID_ARG_TYPE(name, "AbortSignal", signal);
	};
	const validateFunction = (value, name) => {
		if (typeof value !== "function") throw new ERR_INVALID_ARG_TYPE(name, "Function", value);
	};
	module.exports = {
		AggregateError,
		kEmptyObject: Object.freeze({}),
		once(callback) {
			let called = false;
			return function(...args) {
				if (called) return;
				called = true;
				callback.apply(this, args);
			};
		},
		createDeferredPromise: function() {
			let resolve;
			let reject;
			return {
				promise: new Promise((res, rej) => {
					resolve = res;
					reject = rej;
				}),
				resolve,
				reject
			};
		},
		promisify(fn) {
			return new Promise((resolve, reject) => {
				fn((err, ...args) => {
					if (err) return reject(err);
					return resolve(...args);
				});
			});
		},
		debuglog() {
			return function() {};
		},
		format,
		inspect,
		types: {
			isAsyncFunction(fn) {
				return fn instanceof AsyncFunction;
			},
			isArrayBufferView(arr) {
				return ArrayBuffer.isView(arr);
			}
		},
		isBlob,
		deprecate(fn, message) {
			return fn;
		},
		addAbortListener: require__require_as_import_events().addAbortListener || function addAbortListener(signal, listener) {
			if (signal === void 0) throw new ERR_INVALID_ARG_TYPE("signal", "AbortSignal", signal);
			validateAbortSignal(signal, "signal");
			validateFunction(listener, "listener");
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
				[SymbolDispose]() {
					var _removeEventListener;
					(_removeEventListener = removeEventListener) === null || _removeEventListener === void 0 || _removeEventListener();
				}
			};
		},
		AbortSignalAny: AbortSignal.any || function AbortSignalAny(signals) {
			if (signals.length === 1) return signals[0];
			const ac = new AbortController();
			const abort = () => ac.abort();
			signals.forEach((signal) => {
				validateAbortSignal(signal, "signals");
				signal.addEventListener("abort", abort, { once: true });
			});
			ac.signal.addEventListener("abort", () => {
				signals.forEach((signal) => signal.removeEventListener("abort", abort));
			}, { once: true });
			return ac.signal;
		}
	};
	module.exports.promisify.custom = Symbol.for("nodejs.util.promisify.custom");
}));
//#endregion
//#region ../../node_modules/.pnpm/readable-stream@4.8.0/node_modules/readable-stream/lib/internal/validators.js
var require_validators = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { ArrayIsArray, ArrayPrototypeIncludes, ArrayPrototypeJoin, ArrayPrototypeMap, NumberIsInteger, NumberIsNaN, NumberMAX_SAFE_INTEGER, NumberMIN_SAFE_INTEGER, NumberParseInt, ObjectPrototypeHasOwnProperty, RegExpPrototypeExec, String, StringPrototypeToUpperCase, StringPrototypeTrim } = require_primordials();
	const { hideStackFrames, codes: { ERR_SOCKET_BAD_PORT, ERR_INVALID_ARG_TYPE, ERR_INVALID_ARG_VALUE, ERR_OUT_OF_RANGE, ERR_UNKNOWN_SIGNAL } } = require_errors();
	const { normalizeEncoding } = require_util();
	const { isAsyncFunction, isArrayBufferView } = require_util().types;
	const signals = {};
	function isInt32(value) {
		return value === (value | 0);
	}
	function isUint32(value) {
		return value === value >>> 0;
	}
	const octalReg = /^[0-7]+$/;
	const modeDesc = "must be a 32-bit unsigned integer or an octal string";
	function parseFileMode(value, name, def) {
		if (typeof value === "undefined") value = def;
		if (typeof value === "string") {
			if (RegExpPrototypeExec(octalReg, value) === null) throw new ERR_INVALID_ARG_VALUE(name, value, modeDesc);
			value = NumberParseInt(value, 8);
		}
		validateUint32(value, name);
		return value;
	}
	const validateInteger = hideStackFrames((value, name, min = NumberMIN_SAFE_INTEGER, max = NumberMAX_SAFE_INTEGER) => {
		if (typeof value !== "number") throw new ERR_INVALID_ARG_TYPE(name, "number", value);
		if (!NumberIsInteger(value)) throw new ERR_OUT_OF_RANGE(name, "an integer", value);
		if (value < min || value > max) throw new ERR_OUT_OF_RANGE(name, `>= ${min} && <= ${max}`, value);
	});
	const validateInt32 = hideStackFrames((value, name, min = -2147483648, max = 2147483647) => {
		if (typeof value !== "number") throw new ERR_INVALID_ARG_TYPE(name, "number", value);
		if (!NumberIsInteger(value)) throw new ERR_OUT_OF_RANGE(name, "an integer", value);
		if (value < min || value > max) throw new ERR_OUT_OF_RANGE(name, `>= ${min} && <= ${max}`, value);
	});
	const validateUint32 = hideStackFrames((value, name, positive = false) => {
		if (typeof value !== "number") throw new ERR_INVALID_ARG_TYPE(name, "number", value);
		if (!NumberIsInteger(value)) throw new ERR_OUT_OF_RANGE(name, "an integer", value);
		const min = positive ? 1 : 0;
		const max = 4294967295;
		if (value < min || value > max) throw new ERR_OUT_OF_RANGE(name, `>= ${min} && <= ${max}`, value);
	});
	function validateString(value, name) {
		if (typeof value !== "string") throw new ERR_INVALID_ARG_TYPE(name, "string", value);
	}
	function validateNumber(value, name, min = void 0, max) {
		if (typeof value !== "number") throw new ERR_INVALID_ARG_TYPE(name, "number", value);
		if (min != null && value < min || max != null && value > max || (min != null || max != null) && NumberIsNaN(value)) throw new ERR_OUT_OF_RANGE(name, `${min != null ? `>= ${min}` : ""}${min != null && max != null ? " && " : ""}${max != null ? `<= ${max}` : ""}`, value);
	}
	const validateOneOf = hideStackFrames((value, name, oneOf) => {
		if (!ArrayPrototypeIncludes(oneOf, value)) {
			const reason = "must be one of: " + ArrayPrototypeJoin(ArrayPrototypeMap(oneOf, (v) => typeof v === "string" ? `'${v}'` : String(v)), ", ");
			throw new ERR_INVALID_ARG_VALUE(name, value, reason);
		}
	});
	function validateBoolean(value, name) {
		if (typeof value !== "boolean") throw new ERR_INVALID_ARG_TYPE(name, "boolean", value);
	}
	function getOwnPropertyValueOrDefault(options, key, defaultValue) {
		return options == null || !ObjectPrototypeHasOwnProperty(options, key) ? defaultValue : options[key];
	}
	const validateObject = hideStackFrames((value, name, options = null) => {
		const allowArray = getOwnPropertyValueOrDefault(options, "allowArray", false);
		const allowFunction = getOwnPropertyValueOrDefault(options, "allowFunction", false);
		if (!getOwnPropertyValueOrDefault(options, "nullable", false) && value === null || !allowArray && ArrayIsArray(value) || typeof value !== "object" && (!allowFunction || typeof value !== "function")) throw new ERR_INVALID_ARG_TYPE(name, "Object", value);
	});
	const validateDictionary = hideStackFrames((value, name) => {
		if (value != null && typeof value !== "object" && typeof value !== "function") throw new ERR_INVALID_ARG_TYPE(name, "a dictionary", value);
	});
	const validateArray = hideStackFrames((value, name, minLength = 0) => {
		if (!ArrayIsArray(value)) throw new ERR_INVALID_ARG_TYPE(name, "Array", value);
		if (value.length < minLength) {
			const reason = `must be longer than ${minLength}`;
			throw new ERR_INVALID_ARG_VALUE(name, value, reason);
		}
	});
	function validateStringArray(value, name) {
		validateArray(value, name);
		for (let i = 0; i < value.length; i++) validateString(value[i], `${name}[${i}]`);
	}
	function validateBooleanArray(value, name) {
		validateArray(value, name);
		for (let i = 0; i < value.length; i++) validateBoolean(value[i], `${name}[${i}]`);
	}
	function validateAbortSignalArray(value, name) {
		validateArray(value, name);
		for (let i = 0; i < value.length; i++) {
			const signal = value[i];
			const indexedName = `${name}[${i}]`;
			if (signal == null) throw new ERR_INVALID_ARG_TYPE(indexedName, "AbortSignal", signal);
			validateAbortSignal(signal, indexedName);
		}
	}
	function validateSignalName(signal, name = "signal") {
		validateString(signal, name);
		if (signals[signal] === void 0) {
			if (signals[StringPrototypeToUpperCase(signal)] !== void 0) throw new ERR_UNKNOWN_SIGNAL(signal + " (signals must use all capital letters)");
			throw new ERR_UNKNOWN_SIGNAL(signal);
		}
	}
	const validateBuffer = hideStackFrames((buffer, name = "buffer") => {
		if (!isArrayBufferView(buffer)) throw new ERR_INVALID_ARG_TYPE(name, [
			"Buffer",
			"TypedArray",
			"DataView"
		], buffer);
	});
	function validateEncoding(data, encoding) {
		const normalizedEncoding = normalizeEncoding(encoding);
		const length = data.length;
		if (normalizedEncoding === "hex" && length % 2 !== 0) throw new ERR_INVALID_ARG_VALUE("encoding", encoding, `is invalid for data of length ${length}`);
	}
	function validatePort(port, name = "Port", allowZero = true) {
		if (typeof port !== "number" && typeof port !== "string" || typeof port === "string" && StringPrototypeTrim(port).length === 0 || +port !== +port >>> 0 || port > 65535 || port === 0 && !allowZero) throw new ERR_SOCKET_BAD_PORT(name, port, allowZero);
		return port | 0;
	}
	const validateAbortSignal = hideStackFrames((signal, name) => {
		if (signal !== void 0 && (signal === null || typeof signal !== "object" || !("aborted" in signal))) throw new ERR_INVALID_ARG_TYPE(name, "AbortSignal", signal);
	});
	const validateFunction = hideStackFrames((value, name) => {
		if (typeof value !== "function") throw new ERR_INVALID_ARG_TYPE(name, "Function", value);
	});
	const validatePlainFunction = hideStackFrames((value, name) => {
		if (typeof value !== "function" || isAsyncFunction(value)) throw new ERR_INVALID_ARG_TYPE(name, "Function", value);
	});
	const validateUndefined = hideStackFrames((value, name) => {
		if (value !== void 0) throw new ERR_INVALID_ARG_TYPE(name, "undefined", value);
	});
	function validateUnion(value, name, union) {
		if (!ArrayPrototypeIncludes(union, value)) throw new ERR_INVALID_ARG_TYPE(name, `('${ArrayPrototypeJoin(union, "|")}')`, value);
	}
	const linkValueRegExp = /^(?:<[^>]*>)(?:\s*;\s*[^;"\s]+(?:=(")?[^;"\s]*\1)?)*$/;
	function validateLinkHeaderFormat(value, name) {
		if (typeof value === "undefined" || !RegExpPrototypeExec(linkValueRegExp, value)) throw new ERR_INVALID_ARG_VALUE(name, value, "must be an array or string of format \"</styles.css>; rel=preload; as=style\"");
	}
	function validateLinkHeaderValue(hints) {
		if (typeof hints === "string") {
			validateLinkHeaderFormat(hints, "hints");
			return hints;
		} else if (ArrayIsArray(hints)) {
			const hintsLength = hints.length;
			let result = "";
			if (hintsLength === 0) return result;
			for (let i = 0; i < hintsLength; i++) {
				const link = hints[i];
				validateLinkHeaderFormat(link, "hints");
				result += link;
				if (i !== hintsLength - 1) result += ", ";
			}
			return result;
		}
		throw new ERR_INVALID_ARG_VALUE("hints", hints, "must be an array or string of format \"</styles.css>; rel=preload; as=style\"");
	}
	module.exports = {
		isInt32,
		isUint32,
		parseFileMode,
		validateArray,
		validateStringArray,
		validateBooleanArray,
		validateAbortSignalArray,
		validateBoolean,
		validateBuffer,
		validateDictionary,
		validateEncoding,
		validateFunction,
		validateInt32,
		validateInteger,
		validateNumber,
		validateObject,
		validateOneOf,
		validatePlainFunction,
		validatePort,
		validateSignalName,
		validateString,
		validateUint32,
		validateUndefined,
		validateUnion,
		validateAbortSignal,
		validateLinkHeaderValue
	};
}));
//#endregion
//#region \0require-as-import:process
var require__require_as_import_process = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = m$1.default;
}));
//#endregion
//#region ../../node_modules/.pnpm/readable-stream@4.8.0/node_modules/readable-stream/lib/internal/shims/process.js
var require_process = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = ((base, esmKey, keys, isValid) => {
		if (esmKey in base && base[esmKey] === true) {
			let candidate;
			for (const key of keys) {
				if (!(key in base)) continue;
				candidate = base[key];
				if (isValid(candidate)) return candidate;
			}
		}
		return base;
	})(require__require_as_import_process(), "__esModule", ["default", "process"], (candidate) => "nextTick" in candidate);
}));
//#endregion
//#region ../../node_modules/.pnpm/readable-stream@4.8.0/node_modules/readable-stream/lib/internal/streams/utils.js
var require_utils = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { SymbolAsyncIterator, SymbolIterator, SymbolFor } = require_primordials();
	const kIsDestroyed = SymbolFor("nodejs.stream.destroyed");
	const kIsErrored = SymbolFor("nodejs.stream.errored");
	const kIsReadable = SymbolFor("nodejs.stream.readable");
	const kIsWritable = SymbolFor("nodejs.stream.writable");
	const kIsDisturbed = SymbolFor("nodejs.stream.disturbed");
	const kIsClosedPromise = SymbolFor("nodejs.webstream.isClosedPromise");
	const kControllerErrorFunction = SymbolFor("nodejs.webstream.controllerErrorFunction");
	function isReadableNodeStream(obj, strict = false) {
		var _obj$_readableState;
		return !!(obj && typeof obj.pipe === "function" && typeof obj.on === "function" && (!strict || typeof obj.pause === "function" && typeof obj.resume === "function") && (!obj._writableState || ((_obj$_readableState = obj._readableState) === null || _obj$_readableState === void 0 ? void 0 : _obj$_readableState.readable) !== false) && (!obj._writableState || obj._readableState));
	}
	function isWritableNodeStream(obj) {
		var _obj$_writableState;
		return !!(obj && typeof obj.write === "function" && typeof obj.on === "function" && (!obj._readableState || ((_obj$_writableState = obj._writableState) === null || _obj$_writableState === void 0 ? void 0 : _obj$_writableState.writable) !== false));
	}
	function isDuplexNodeStream(obj) {
		return !!(obj && typeof obj.pipe === "function" && obj._readableState && typeof obj.on === "function" && typeof obj.write === "function");
	}
	function isNodeStream(obj) {
		return obj && (obj._readableState || obj._writableState || typeof obj.write === "function" && typeof obj.on === "function" || typeof obj.pipe === "function" && typeof obj.on === "function");
	}
	function isReadableStream(obj) {
		return !!(obj && !isNodeStream(obj) && typeof obj.pipeThrough === "function" && typeof obj.getReader === "function" && typeof obj.cancel === "function");
	}
	function isWritableStream(obj) {
		return !!(obj && !isNodeStream(obj) && typeof obj.getWriter === "function" && typeof obj.abort === "function");
	}
	function isTransformStream(obj) {
		return !!(obj && !isNodeStream(obj) && typeof obj.readable === "object" && typeof obj.writable === "object");
	}
	function isWebStream(obj) {
		return isReadableStream(obj) || isWritableStream(obj) || isTransformStream(obj);
	}
	function isIterable(obj, isAsync) {
		if (obj == null) return false;
		if (isAsync === true) return typeof obj[SymbolAsyncIterator] === "function";
		if (isAsync === false) return typeof obj[SymbolIterator] === "function";
		return typeof obj[SymbolAsyncIterator] === "function" || typeof obj[SymbolIterator] === "function";
	}
	function isDestroyed(stream) {
		if (!isNodeStream(stream)) return null;
		const wState = stream._writableState;
		const rState = stream._readableState;
		const state = wState || rState;
		return !!(stream.destroyed || stream[kIsDestroyed] || state !== null && state !== void 0 && state.destroyed);
	}
	function isWritableEnded(stream) {
		if (!isWritableNodeStream(stream)) return null;
		if (stream.writableEnded === true) return true;
		const wState = stream._writableState;
		if (wState !== null && wState !== void 0 && wState.errored) return false;
		if (typeof (wState === null || wState === void 0 ? void 0 : wState.ended) !== "boolean") return null;
		return wState.ended;
	}
	function isWritableFinished(stream, strict) {
		if (!isWritableNodeStream(stream)) return null;
		if (stream.writableFinished === true) return true;
		const wState = stream._writableState;
		if (wState !== null && wState !== void 0 && wState.errored) return false;
		if (typeof (wState === null || wState === void 0 ? void 0 : wState.finished) !== "boolean") return null;
		return !!(wState.finished || strict === false && wState.ended === true && wState.length === 0);
	}
	function isReadableEnded(stream) {
		if (!isReadableNodeStream(stream)) return null;
		if (stream.readableEnded === true) return true;
		const rState = stream._readableState;
		if (!rState || rState.errored) return false;
		if (typeof (rState === null || rState === void 0 ? void 0 : rState.ended) !== "boolean") return null;
		return rState.ended;
	}
	function isReadableFinished(stream, strict) {
		if (!isReadableNodeStream(stream)) return null;
		const rState = stream._readableState;
		if (rState !== null && rState !== void 0 && rState.errored) return false;
		if (typeof (rState === null || rState === void 0 ? void 0 : rState.endEmitted) !== "boolean") return null;
		return !!(rState.endEmitted || strict === false && rState.ended === true && rState.length === 0);
	}
	function isReadable(stream) {
		if (stream && stream[kIsReadable] != null) return stream[kIsReadable];
		if (typeof (stream === null || stream === void 0 ? void 0 : stream.readable) !== "boolean") return null;
		if (isDestroyed(stream)) return false;
		return isReadableNodeStream(stream) && stream.readable && !isReadableFinished(stream);
	}
	function isWritable(stream) {
		if (stream && stream[kIsWritable] != null) return stream[kIsWritable];
		if (typeof (stream === null || stream === void 0 ? void 0 : stream.writable) !== "boolean") return null;
		if (isDestroyed(stream)) return false;
		return isWritableNodeStream(stream) && stream.writable && !isWritableEnded(stream);
	}
	function isFinished(stream, opts) {
		if (!isNodeStream(stream)) return null;
		if (isDestroyed(stream)) return true;
		if ((opts === null || opts === void 0 ? void 0 : opts.readable) !== false && isReadable(stream)) return false;
		if ((opts === null || opts === void 0 ? void 0 : opts.writable) !== false && isWritable(stream)) return false;
		return true;
	}
	function isWritableErrored(stream) {
		var _stream$_writableStat, _stream$_writableStat2;
		if (!isNodeStream(stream)) return null;
		if (stream.writableErrored) return stream.writableErrored;
		return (_stream$_writableStat = (_stream$_writableStat2 = stream._writableState) === null || _stream$_writableStat2 === void 0 ? void 0 : _stream$_writableStat2.errored) !== null && _stream$_writableStat !== void 0 ? _stream$_writableStat : null;
	}
	function isReadableErrored(stream) {
		var _stream$_readableStat, _stream$_readableStat2;
		if (!isNodeStream(stream)) return null;
		if (stream.readableErrored) return stream.readableErrored;
		return (_stream$_readableStat = (_stream$_readableStat2 = stream._readableState) === null || _stream$_readableStat2 === void 0 ? void 0 : _stream$_readableStat2.errored) !== null && _stream$_readableStat !== void 0 ? _stream$_readableStat : null;
	}
	function isClosed(stream) {
		if (!isNodeStream(stream)) return null;
		if (typeof stream.closed === "boolean") return stream.closed;
		const wState = stream._writableState;
		const rState = stream._readableState;
		if (typeof (wState === null || wState === void 0 ? void 0 : wState.closed) === "boolean" || typeof (rState === null || rState === void 0 ? void 0 : rState.closed) === "boolean") return (wState === null || wState === void 0 ? void 0 : wState.closed) || (rState === null || rState === void 0 ? void 0 : rState.closed);
		if (typeof stream._closed === "boolean" && isOutgoingMessage(stream)) return stream._closed;
		return null;
	}
	function isOutgoingMessage(stream) {
		return typeof stream._closed === "boolean" && typeof stream._defaultKeepAlive === "boolean" && typeof stream._removedConnection === "boolean" && typeof stream._removedContLen === "boolean";
	}
	function isServerResponse(stream) {
		return typeof stream._sent100 === "boolean" && isOutgoingMessage(stream);
	}
	function isServerRequest(stream) {
		var _stream$req;
		return typeof stream._consuming === "boolean" && typeof stream._dumped === "boolean" && ((_stream$req = stream.req) === null || _stream$req === void 0 ? void 0 : _stream$req.upgradeOrConnect) === void 0;
	}
	function willEmitClose(stream) {
		if (!isNodeStream(stream)) return null;
		const wState = stream._writableState;
		const rState = stream._readableState;
		const state = wState || rState;
		return !state && isServerResponse(stream) || !!(state && state.autoDestroy && state.emitClose && state.closed === false);
	}
	function isDisturbed(stream) {
		var _stream$kIsDisturbed;
		return !!(stream && ((_stream$kIsDisturbed = stream[kIsDisturbed]) !== null && _stream$kIsDisturbed !== void 0 ? _stream$kIsDisturbed : stream.readableDidRead || stream.readableAborted));
	}
	function isErrored(stream) {
		var _ref, _ref2, _ref3, _ref4, _ref5, _stream$kIsErrored, _stream$_readableStat3, _stream$_writableStat3, _stream$_readableStat4, _stream$_writableStat4;
		return !!(stream && ((_ref = (_ref2 = (_ref3 = (_ref4 = (_ref5 = (_stream$kIsErrored = stream[kIsErrored]) !== null && _stream$kIsErrored !== void 0 ? _stream$kIsErrored : stream.readableErrored) !== null && _ref5 !== void 0 ? _ref5 : stream.writableErrored) !== null && _ref4 !== void 0 ? _ref4 : (_stream$_readableStat3 = stream._readableState) === null || _stream$_readableStat3 === void 0 ? void 0 : _stream$_readableStat3.errorEmitted) !== null && _ref3 !== void 0 ? _ref3 : (_stream$_writableStat3 = stream._writableState) === null || _stream$_writableStat3 === void 0 ? void 0 : _stream$_writableStat3.errorEmitted) !== null && _ref2 !== void 0 ? _ref2 : (_stream$_readableStat4 = stream._readableState) === null || _stream$_readableStat4 === void 0 ? void 0 : _stream$_readableStat4.errored) !== null && _ref !== void 0 ? _ref : (_stream$_writableStat4 = stream._writableState) === null || _stream$_writableStat4 === void 0 ? void 0 : _stream$_writableStat4.errored));
	}
	module.exports = {
		isDestroyed,
		kIsDestroyed,
		isDisturbed,
		kIsDisturbed,
		isErrored,
		kIsErrored,
		isReadable,
		kIsReadable,
		kIsClosedPromise,
		kControllerErrorFunction,
		kIsWritable,
		isClosed,
		isDuplexNodeStream,
		isFinished,
		isIterable,
		isReadableNodeStream,
		isReadableStream,
		isReadableEnded,
		isReadableFinished,
		isReadableErrored,
		isNodeStream,
		isWebStream,
		isWritable,
		isWritableNodeStream,
		isWritableStream,
		isWritableEnded,
		isWritableFinished,
		isWritableErrored,
		isServerRequest,
		isServerResponse,
		willEmitClose,
		isTransformStream
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/readable-stream@4.8.0/node_modules/readable-stream/lib/internal/streams/end-of-stream.js
var require_end_of_stream = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const process = require_process();
	const { AbortError, codes } = require_errors();
	const { ERR_INVALID_ARG_TYPE, ERR_STREAM_PREMATURE_CLOSE } = codes;
	const { kEmptyObject, once } = require_util();
	const { validateAbortSignal, validateFunction, validateObject, validateBoolean } = require_validators();
	const { Promise, PromisePrototypeThen, SymbolDispose } = require_primordials();
	const { isClosed, isReadable, isReadableNodeStream, isReadableStream, isReadableFinished, isReadableErrored, isWritable, isWritableNodeStream, isWritableStream, isWritableFinished, isWritableErrored, isNodeStream, willEmitClose: _willEmitClose, kIsClosedPromise } = require_utils();
	let addAbortListener;
	function isRequest(stream) {
		return stream.setHeader && typeof stream.abort === "function";
	}
	const nop = () => {};
	function eos(stream, options, callback) {
		var _options$readable, _options$writable;
		if (arguments.length === 2) {
			callback = options;
			options = kEmptyObject;
		} else if (options == null) options = kEmptyObject;
		else validateObject(options, "options");
		validateFunction(callback, "callback");
		validateAbortSignal(options.signal, "options.signal");
		callback = once(callback);
		if (isReadableStream(stream) || isWritableStream(stream)) return eosWeb(stream, options, callback);
		if (!isNodeStream(stream)) throw new ERR_INVALID_ARG_TYPE("stream", [
			"ReadableStream",
			"WritableStream",
			"Stream"
		], stream);
		const readable = (_options$readable = options.readable) !== null && _options$readable !== void 0 ? _options$readable : isReadableNodeStream(stream);
		const writable = (_options$writable = options.writable) !== null && _options$writable !== void 0 ? _options$writable : isWritableNodeStream(stream);
		const wState = stream._writableState;
		const rState = stream._readableState;
		const onlegacyfinish = () => {
			if (!stream.writable) onfinish();
		};
		let willEmitClose = _willEmitClose(stream) && isReadableNodeStream(stream) === readable && isWritableNodeStream(stream) === writable;
		let writableFinished = isWritableFinished(stream, false);
		const onfinish = () => {
			writableFinished = true;
			if (stream.destroyed) willEmitClose = false;
			if (willEmitClose && (!stream.readable || readable)) return;
			if (!readable || readableFinished) callback.call(stream);
		};
		let readableFinished = isReadableFinished(stream, false);
		const onend = () => {
			readableFinished = true;
			if (stream.destroyed) willEmitClose = false;
			if (willEmitClose && (!stream.writable || writable)) return;
			if (!writable || writableFinished) callback.call(stream);
		};
		const onerror = (err) => {
			callback.call(stream, err);
		};
		let closed = isClosed(stream);
		const onclose = () => {
			closed = true;
			const errored = isWritableErrored(stream) || isReadableErrored(stream);
			if (errored && typeof errored !== "boolean") return callback.call(stream, errored);
			if (readable && !readableFinished && isReadableNodeStream(stream, true)) {
				if (!isReadableFinished(stream, false)) return callback.call(stream, new ERR_STREAM_PREMATURE_CLOSE());
			}
			if (writable && !writableFinished) {
				if (!isWritableFinished(stream, false)) return callback.call(stream, new ERR_STREAM_PREMATURE_CLOSE());
			}
			callback.call(stream);
		};
		const onclosed = () => {
			closed = true;
			const errored = isWritableErrored(stream) || isReadableErrored(stream);
			if (errored && typeof errored !== "boolean") return callback.call(stream, errored);
			callback.call(stream);
		};
		const onrequest = () => {
			stream.req.on("finish", onfinish);
		};
		if (isRequest(stream)) {
			stream.on("complete", onfinish);
			if (!willEmitClose) stream.on("abort", onclose);
			if (stream.req) onrequest();
			else stream.on("request", onrequest);
		} else if (writable && !wState) {
			stream.on("end", onlegacyfinish);
			stream.on("close", onlegacyfinish);
		}
		if (!willEmitClose && typeof stream.aborted === "boolean") stream.on("aborted", onclose);
		stream.on("end", onend);
		stream.on("finish", onfinish);
		if (options.error !== false) stream.on("error", onerror);
		stream.on("close", onclose);
		if (closed) process.nextTick(onclose);
		else if (wState !== null && wState !== void 0 && wState.errorEmitted || rState !== null && rState !== void 0 && rState.errorEmitted) {
			if (!willEmitClose) process.nextTick(onclosed);
		} else if (!readable && (!willEmitClose || isReadable(stream)) && (writableFinished || isWritable(stream) === false)) process.nextTick(onclosed);
		else if (!writable && (!willEmitClose || isWritable(stream)) && (readableFinished || isReadable(stream) === false)) process.nextTick(onclosed);
		else if (rState && stream.req && stream.aborted) process.nextTick(onclosed);
		const cleanup = () => {
			callback = nop;
			stream.removeListener("aborted", onclose);
			stream.removeListener("complete", onfinish);
			stream.removeListener("abort", onclose);
			stream.removeListener("request", onrequest);
			if (stream.req) stream.req.removeListener("finish", onfinish);
			stream.removeListener("end", onlegacyfinish);
			stream.removeListener("close", onlegacyfinish);
			stream.removeListener("finish", onfinish);
			stream.removeListener("end", onend);
			stream.removeListener("error", onerror);
			stream.removeListener("close", onclose);
		};
		if (options.signal && !closed) {
			const abort = () => {
				const endCallback = callback;
				cleanup();
				endCallback.call(stream, new AbortError(void 0, { cause: options.signal.reason }));
			};
			if (options.signal.aborted) process.nextTick(abort);
			else {
				addAbortListener = addAbortListener || require_util().addAbortListener;
				const disposable = addAbortListener(options.signal, abort);
				const originalCallback = callback;
				callback = once((...args) => {
					disposable[SymbolDispose]();
					originalCallback.apply(stream, args);
				});
			}
		}
		return cleanup;
	}
	function eosWeb(stream, options, callback) {
		let isAborted = false;
		let abort = nop;
		if (options.signal) {
			abort = () => {
				isAborted = true;
				callback.call(stream, new AbortError(void 0, { cause: options.signal.reason }));
			};
			if (options.signal.aborted) process.nextTick(abort);
			else {
				addAbortListener = addAbortListener || require_util().addAbortListener;
				const disposable = addAbortListener(options.signal, abort);
				const originalCallback = callback;
				callback = once((...args) => {
					disposable[SymbolDispose]();
					originalCallback.apply(stream, args);
				});
			}
		}
		const resolverFn = (...args) => {
			if (!isAborted) process.nextTick(() => callback.apply(stream, args));
		};
		PromisePrototypeThen(stream[kIsClosedPromise].promise, resolverFn, resolverFn);
		return nop;
	}
	function finished(stream, opts) {
		var _opts;
		let autoCleanup = false;
		if (opts === null) opts = kEmptyObject;
		if ((_opts = opts) !== null && _opts !== void 0 && _opts.cleanup) {
			validateBoolean(opts.cleanup, "cleanup");
			autoCleanup = opts.cleanup;
		}
		return new Promise((resolve, reject) => {
			const cleanup = eos(stream, opts, (err) => {
				if (autoCleanup) cleanup();
				if (err) reject(err);
				else resolve();
			});
		});
	}
	module.exports = eos;
	module.exports.finished = finished;
}));
//#endregion
//#region ../../node_modules/.pnpm/readable-stream@4.8.0/node_modules/readable-stream/lib/internal/streams/destroy.js
var require_destroy = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const process = require_process();
	const { aggregateTwoErrors, codes: { ERR_MULTIPLE_CALLBACK }, AbortError } = require_errors();
	const { Symbol } = require_primordials();
	const { kIsDestroyed, isDestroyed, isFinished, isServerRequest } = require_utils();
	const kDestroy = Symbol("kDestroy");
	const kConstruct = Symbol("kConstruct");
	function checkError(err, w, r) {
		if (err) {
			err.stack;
			if (w && !w.errored) w.errored = err;
			if (r && !r.errored) r.errored = err;
		}
	}
	function destroy(err, cb) {
		const r = this._readableState;
		const w = this._writableState;
		const s = w || r;
		if (w !== null && w !== void 0 && w.destroyed || r !== null && r !== void 0 && r.destroyed) {
			if (typeof cb === "function") cb();
			return this;
		}
		checkError(err, w, r);
		if (w) w.destroyed = true;
		if (r) r.destroyed = true;
		if (!s.constructed) this.once(kDestroy, function(er) {
			_destroy(this, aggregateTwoErrors(er, err), cb);
		});
		else _destroy(this, err, cb);
		return this;
	}
	function _destroy(self, err, cb) {
		let called = false;
		function onDestroy(err) {
			if (called) return;
			called = true;
			const r = self._readableState;
			const w = self._writableState;
			checkError(err, w, r);
			if (w) w.closed = true;
			if (r) r.closed = true;
			if (typeof cb === "function") cb(err);
			if (err) process.nextTick(emitErrorCloseNT, self, err);
			else process.nextTick(emitCloseNT, self);
		}
		try {
			self._destroy(err || null, onDestroy);
		} catch (err) {
			onDestroy(err);
		}
	}
	function emitErrorCloseNT(self, err) {
		emitErrorNT(self, err);
		emitCloseNT(self);
	}
	function emitCloseNT(self) {
		const r = self._readableState;
		const w = self._writableState;
		if (w) w.closeEmitted = true;
		if (r) r.closeEmitted = true;
		if (w !== null && w !== void 0 && w.emitClose || r !== null && r !== void 0 && r.emitClose) self.emit("close");
	}
	function emitErrorNT(self, err) {
		const r = self._readableState;
		const w = self._writableState;
		if (w !== null && w !== void 0 && w.errorEmitted || r !== null && r !== void 0 && r.errorEmitted) return;
		if (w) w.errorEmitted = true;
		if (r) r.errorEmitted = true;
		self.emit("error", err);
	}
	function undestroy() {
		const r = this._readableState;
		const w = this._writableState;
		if (r) {
			r.constructed = true;
			r.closed = false;
			r.closeEmitted = false;
			r.destroyed = false;
			r.errored = null;
			r.errorEmitted = false;
			r.reading = false;
			r.ended = r.readable === false;
			r.endEmitted = r.readable === false;
		}
		if (w) {
			w.constructed = true;
			w.destroyed = false;
			w.closed = false;
			w.closeEmitted = false;
			w.errored = null;
			w.errorEmitted = false;
			w.finalCalled = false;
			w.prefinished = false;
			w.ended = w.writable === false;
			w.ending = w.writable === false;
			w.finished = w.writable === false;
		}
	}
	function errorOrDestroy(stream, err, sync) {
		const r = stream._readableState;
		const w = stream._writableState;
		if (w !== null && w !== void 0 && w.destroyed || r !== null && r !== void 0 && r.destroyed) return this;
		if (r !== null && r !== void 0 && r.autoDestroy || w !== null && w !== void 0 && w.autoDestroy) stream.destroy(err);
		else if (err) {
			err.stack;
			if (w && !w.errored) w.errored = err;
			if (r && !r.errored) r.errored = err;
			if (sync) process.nextTick(emitErrorNT, stream, err);
			else emitErrorNT(stream, err);
		}
	}
	function construct(stream, cb) {
		if (typeof stream._construct !== "function") return;
		const r = stream._readableState;
		const w = stream._writableState;
		if (r) r.constructed = false;
		if (w) w.constructed = false;
		stream.once(kConstruct, cb);
		if (stream.listenerCount(kConstruct) > 1) return;
		process.nextTick(constructNT, stream);
	}
	function constructNT(stream) {
		let called = false;
		function onConstruct(err) {
			if (called) {
				errorOrDestroy(stream, err !== null && err !== void 0 ? err : new ERR_MULTIPLE_CALLBACK());
				return;
			}
			called = true;
			const r = stream._readableState;
			const w = stream._writableState;
			const s = w || r;
			if (r) r.constructed = true;
			if (w) w.constructed = true;
			if (s.destroyed) stream.emit(kDestroy, err);
			else if (err) errorOrDestroy(stream, err, true);
			else process.nextTick(emitConstructNT, stream);
		}
		try {
			stream._construct((err) => {
				process.nextTick(onConstruct, err);
			});
		} catch (err) {
			process.nextTick(onConstruct, err);
		}
	}
	function emitConstructNT(stream) {
		stream.emit(kConstruct);
	}
	function isRequest(stream) {
		return (stream === null || stream === void 0 ? void 0 : stream.setHeader) && typeof stream.abort === "function";
	}
	function emitCloseLegacy(stream) {
		stream.emit("close");
	}
	function emitErrorCloseLegacy(stream, err) {
		stream.emit("error", err);
		process.nextTick(emitCloseLegacy, stream);
	}
	function destroyer(stream, err) {
		if (!stream || isDestroyed(stream)) return;
		if (!err && !isFinished(stream)) err = new AbortError();
		if (isServerRequest(stream)) {
			stream.socket = null;
			stream.destroy(err);
		} else if (isRequest(stream)) stream.abort();
		else if (isRequest(stream.req)) stream.req.abort();
		else if (typeof stream.destroy === "function") stream.destroy(err);
		else if (typeof stream.close === "function") stream.close();
		else if (err) process.nextTick(emitErrorCloseLegacy, stream, err);
		else process.nextTick(emitCloseLegacy, stream);
		if (!stream.destroyed) stream[kIsDestroyed] = true;
	}
	module.exports = {
		construct,
		destroyer,
		destroy,
		undestroy,
		errorOrDestroy
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/readable-stream@4.8.0/node_modules/readable-stream/lib/internal/streams/legacy.js
var require_legacy = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { ArrayIsArray, ObjectSetPrototypeOf } = require_primordials();
	const { EventEmitter: EE } = require__require_as_import_events();
	function Stream(opts) {
		EE.call(this, opts);
	}
	ObjectSetPrototypeOf(Stream.prototype, EE.prototype);
	ObjectSetPrototypeOf(Stream, EE);
	Stream.prototype.pipe = function(dest, options) {
		const source = this;
		function ondata(chunk) {
			if (dest.writable && dest.write(chunk) === false && source.pause) source.pause();
		}
		source.on("data", ondata);
		function ondrain() {
			if (source.readable && source.resume) source.resume();
		}
		dest.on("drain", ondrain);
		if (!dest._isStdio && (!options || options.end !== false)) {
			source.on("end", onend);
			source.on("close", onclose);
		}
		let didOnEnd = false;
		function onend() {
			if (didOnEnd) return;
			didOnEnd = true;
			dest.end();
		}
		function onclose() {
			if (didOnEnd) return;
			didOnEnd = true;
			if (typeof dest.destroy === "function") dest.destroy();
		}
		function onerror(er) {
			var _this$listenerCount;
			cleanup();
			if (((_this$listenerCount = this.listenerCount) === null || _this$listenerCount === void 0 ? void 0 : _this$listenerCount.call(this, "error")) === 0) this.emit("error", er);
		}
		prependListener(source, "error", onerror);
		prependListener(dest, "error", onerror);
		function cleanup() {
			source.removeListener("data", ondata);
			dest.removeListener("drain", ondrain);
			source.removeListener("end", onend);
			source.removeListener("close", onclose);
			source.removeListener("error", onerror);
			dest.removeListener("error", onerror);
			source.removeListener("end", cleanup);
			source.removeListener("close", cleanup);
			dest.removeListener("close", cleanup);
		}
		source.on("end", cleanup);
		source.on("close", cleanup);
		dest.on("close", cleanup);
		dest.emit("pipe", source);
		return dest;
	};
	function prependListener(emitter, event, fn) {
		if (typeof emitter.prependListener === "function") return emitter.prependListener(event, fn);
		if (!emitter._events || !emitter._events[event]) emitter.on(event, fn);
		else if (ArrayIsArray(emitter._events[event])) emitter._events[event].unshift(fn);
		else emitter._events[event] = [fn, emitter._events[event]];
	}
	module.exports = {
		Stream,
		prependListener
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/readable-stream@4.8.0/node_modules/readable-stream/lib/internal/streams/add-abort-signal.js
var require_add_abort_signal = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { SymbolDispose } = require_primordials();
	const { AbortError, codes } = require_errors();
	const { isNodeStream, isWebStream, kControllerErrorFunction } = require_utils();
	const eos = require_end_of_stream();
	const { ERR_INVALID_ARG_TYPE } = codes;
	let addAbortListener;
	const validateAbortSignal = (signal, name) => {
		if (typeof signal !== "object" || !("aborted" in signal)) throw new ERR_INVALID_ARG_TYPE(name, "AbortSignal", signal);
	};
	module.exports.addAbortSignal = function addAbortSignal(signal, stream) {
		validateAbortSignal(signal, "signal");
		if (!isNodeStream(stream) && !isWebStream(stream)) throw new ERR_INVALID_ARG_TYPE("stream", [
			"ReadableStream",
			"WritableStream",
			"Stream"
		], stream);
		return module.exports.addAbortSignalNoValidate(signal, stream);
	};
	module.exports.addAbortSignalNoValidate = function(signal, stream) {
		if (typeof signal !== "object" || !("aborted" in signal)) return stream;
		const onAbort = isNodeStream(stream) ? () => {
			stream.destroy(new AbortError(void 0, { cause: signal.reason }));
		} : () => {
			stream[kControllerErrorFunction](new AbortError(void 0, { cause: signal.reason }));
		};
		if (signal.aborted) onAbort();
		else {
			addAbortListener = addAbortListener || require_util().addAbortListener;
			const disposable = addAbortListener(signal, onAbort);
			eos(stream, disposable[SymbolDispose]);
		}
		return stream;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/readable-stream@4.8.0/node_modules/readable-stream/lib/internal/streams/buffer_list.js
var require_buffer_list = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { StringPrototypeSlice, SymbolIterator, TypedArrayPrototypeSet, Uint8Array } = require_primordials();
	const { Buffer } = require__require_as_import_buffer();
	const { inspect } = require_util();
	module.exports = class BufferList {
		constructor() {
			this.head = null;
			this.tail = null;
			this.length = 0;
		}
		push(v) {
			const entry = {
				data: v,
				next: null
			};
			if (this.length > 0) this.tail.next = entry;
			else this.head = entry;
			this.tail = entry;
			++this.length;
		}
		unshift(v) {
			const entry = {
				data: v,
				next: this.head
			};
			if (this.length === 0) this.tail = entry;
			this.head = entry;
			++this.length;
		}
		shift() {
			if (this.length === 0) return;
			const ret = this.head.data;
			if (this.length === 1) this.head = this.tail = null;
			else this.head = this.head.next;
			--this.length;
			return ret;
		}
		clear() {
			this.head = this.tail = null;
			this.length = 0;
		}
		join(s) {
			if (this.length === 0) return "";
			let p = this.head;
			let ret = "" + p.data;
			while ((p = p.next) !== null) ret += s + p.data;
			return ret;
		}
		concat(n) {
			if (this.length === 0) return Buffer.alloc(0);
			const ret = Buffer.allocUnsafe(n >>> 0);
			let p = this.head;
			let i = 0;
			while (p) {
				TypedArrayPrototypeSet(ret, p.data, i);
				i += p.data.length;
				p = p.next;
			}
			return ret;
		}
		consume(n, hasStrings) {
			const data = this.head.data;
			if (n < data.length) {
				const slice = data.slice(0, n);
				this.head.data = data.slice(n);
				return slice;
			}
			if (n === data.length) return this.shift();
			return hasStrings ? this._getString(n) : this._getBuffer(n);
		}
		first() {
			return this.head.data;
		}
		*[SymbolIterator]() {
			for (let p = this.head; p; p = p.next) yield p.data;
		}
		_getString(n) {
			let ret = "";
			let p = this.head;
			let c = 0;
			do {
				const str = p.data;
				if (n > str.length) {
					ret += str;
					n -= str.length;
				} else {
					if (n === str.length) {
						ret += str;
						++c;
						if (p.next) this.head = p.next;
						else this.head = this.tail = null;
					} else {
						ret += StringPrototypeSlice(str, 0, n);
						this.head = p;
						p.data = StringPrototypeSlice(str, n);
					}
					break;
				}
				++c;
			} while ((p = p.next) !== null);
			this.length -= c;
			return ret;
		}
		_getBuffer(n) {
			const ret = Buffer.allocUnsafe(n);
			const retLen = n;
			let p = this.head;
			let c = 0;
			do {
				const buf = p.data;
				if (n > buf.length) {
					TypedArrayPrototypeSet(ret, buf, retLen - n);
					n -= buf.length;
				} else {
					if (n === buf.length) {
						TypedArrayPrototypeSet(ret, buf, retLen - n);
						++c;
						if (p.next) this.head = p.next;
						else this.head = this.tail = null;
					} else {
						TypedArrayPrototypeSet(ret, new Uint8Array(buf.buffer, buf.byteOffset, n), retLen - n);
						this.head = p;
						p.data = buf.slice(n);
					}
					break;
				}
				++c;
			} while ((p = p.next) !== null);
			this.length -= c;
			return ret;
		}
		[Symbol.for("nodejs.util.inspect.custom")](_, options) {
			return inspect(this, {
				...options,
				depth: 0,
				customInspect: false
			});
		}
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/readable-stream@4.8.0/node_modules/readable-stream/lib/internal/streams/state.js
var require_state = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { MathFloor, NumberIsInteger } = require_primordials();
	const { validateInteger } = require_validators();
	const { ERR_INVALID_ARG_VALUE } = require_errors().codes;
	let defaultHighWaterMarkBytes = 16384;
	let defaultHighWaterMarkObjectMode = 16;
	function highWaterMarkFrom(options, isDuplex, duplexKey) {
		return options.highWaterMark != null ? options.highWaterMark : isDuplex ? options[duplexKey] : null;
	}
	function getDefaultHighWaterMark(objectMode) {
		return objectMode ? defaultHighWaterMarkObjectMode : defaultHighWaterMarkBytes;
	}
	function setDefaultHighWaterMark(objectMode, value) {
		validateInteger(value, "value", 0);
		if (objectMode) defaultHighWaterMarkObjectMode = value;
		else defaultHighWaterMarkBytes = value;
	}
	function getHighWaterMark(state, options, duplexKey, isDuplex) {
		const hwm = highWaterMarkFrom(options, isDuplex, duplexKey);
		if (hwm != null) {
			if (!NumberIsInteger(hwm) || hwm < 0) {
				const name = isDuplex ? `options.${duplexKey}` : "options.highWaterMark";
				throw new ERR_INVALID_ARG_VALUE(name, hwm);
			}
			return MathFloor(hwm);
		}
		return getDefaultHighWaterMark(state.objectMode);
	}
	module.exports = {
		getHighWaterMark,
		getDefaultHighWaterMark,
		setDefaultHighWaterMark
	};
}));
//#endregion
//#region \0require-as-import:string_decoder
var require__require_as_import_string_decoder = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = m.default;
}));
//#endregion
//#region ../../node_modules/.pnpm/readable-stream@4.8.0/node_modules/readable-stream/lib/internal/streams/from.js
var require_from = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const process = require_process();
	const { PromisePrototypeThen, SymbolAsyncIterator, SymbolIterator } = require_primordials();
	const { Buffer } = require__require_as_import_buffer();
	const { ERR_INVALID_ARG_TYPE, ERR_STREAM_NULL_VALUES } = require_errors().codes;
	function from(Readable, iterable, opts) {
		let iterator;
		if (typeof iterable === "string" || iterable instanceof Buffer) return new Readable({
			objectMode: true,
			...opts,
			read() {
				this.push(iterable);
				this.push(null);
			}
		});
		let isAsync;
		if (iterable && iterable[SymbolAsyncIterator]) {
			isAsync = true;
			iterator = iterable[SymbolAsyncIterator]();
		} else if (iterable && iterable[SymbolIterator]) {
			isAsync = false;
			iterator = iterable[SymbolIterator]();
		} else throw new ERR_INVALID_ARG_TYPE("iterable", ["Iterable"], iterable);
		const readable = new Readable({
			objectMode: true,
			highWaterMark: 1,
			...opts
		});
		let reading = false;
		readable._read = function() {
			if (!reading) {
				reading = true;
				next();
			}
		};
		readable._destroy = function(error, cb) {
			PromisePrototypeThen(close(error), () => process.nextTick(cb, error), (e) => process.nextTick(cb, e || error));
		};
		async function close(error) {
			const hadError = error !== void 0 && error !== null;
			const hasThrow = typeof iterator.throw === "function";
			if (hadError && hasThrow) {
				const { value, done } = await iterator.throw(error);
				await value;
				if (done) return;
			}
			if (typeof iterator.return === "function") {
				const { value } = await iterator.return();
				await value;
			}
		}
		async function next() {
			for (;;) {
				try {
					const { value, done } = isAsync ? await iterator.next() : iterator.next();
					if (done) readable.push(null);
					else {
						const res = value && typeof value.then === "function" ? await value : value;
						if (res === null) {
							reading = false;
							throw new ERR_STREAM_NULL_VALUES();
						} else if (readable.push(res)) continue;
						else reading = false;
					}
				} catch (err) {
					readable.destroy(err);
				}
				break;
			}
		}
		return readable;
	}
	module.exports = from;
}));
//#endregion
//#region ../../node_modules/.pnpm/readable-stream@4.8.0/node_modules/readable-stream/lib/internal/streams/readable.js
var require_readable = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const process = require_process();
	const { ArrayPrototypeIndexOf, NumberIsInteger, NumberIsNaN, NumberParseInt, ObjectDefineProperties, ObjectKeys, ObjectSetPrototypeOf, Promise, SafeSet, SymbolAsyncDispose, SymbolAsyncIterator, Symbol } = require_primordials();
	module.exports = Readable;
	Readable.ReadableState = ReadableState;
	const { EventEmitter: EE } = require__require_as_import_events();
	const { Stream, prependListener } = require_legacy();
	const { Buffer } = require__require_as_import_buffer();
	const { addAbortSignal } = require_add_abort_signal();
	const eos = require_end_of_stream();
	let debug = require_util().debuglog("stream", (fn) => {
		debug = fn;
	});
	const BufferList = require_buffer_list();
	const destroyImpl = require_destroy();
	const { getHighWaterMark, getDefaultHighWaterMark } = require_state();
	const { aggregateTwoErrors, codes: { ERR_INVALID_ARG_TYPE, ERR_METHOD_NOT_IMPLEMENTED, ERR_OUT_OF_RANGE, ERR_STREAM_PUSH_AFTER_EOF, ERR_STREAM_UNSHIFT_AFTER_END_EVENT }, AbortError } = require_errors();
	const { validateObject } = require_validators();
	const kPaused = Symbol("kPaused");
	const { StringDecoder } = require__require_as_import_string_decoder();
	const from = require_from();
	ObjectSetPrototypeOf(Readable.prototype, Stream.prototype);
	ObjectSetPrototypeOf(Readable, Stream);
	const nop = () => {};
	const { errorOrDestroy } = destroyImpl;
	const kObjectMode = 1;
	const kEnded = 2;
	const kEndEmitted = 4;
	const kReading = 8;
	const kConstructed = 16;
	const kSync = 32;
	const kNeedReadable = 64;
	const kEmittedReadable = 128;
	const kReadableListening = 256;
	const kResumeScheduled = 512;
	const kErrorEmitted = 1024;
	const kEmitClose = 2048;
	const kAutoDestroy = 4096;
	const kDestroyed = 8192;
	const kClosed = 16384;
	const kCloseEmitted = 32768;
	const kMultiAwaitDrain = 65536;
	const kReadingMore = 1 << 17;
	const kDataEmitted = 1 << 18;
	function makeBitMapDescriptor(bit) {
		return {
			enumerable: false,
			get() {
				return (this.state & bit) !== 0;
			},
			set(value) {
				if (value) this.state |= bit;
				else this.state &= ~bit;
			}
		};
	}
	ObjectDefineProperties(ReadableState.prototype, {
		objectMode: makeBitMapDescriptor(kObjectMode),
		ended: makeBitMapDescriptor(kEnded),
		endEmitted: makeBitMapDescriptor(kEndEmitted),
		reading: makeBitMapDescriptor(kReading),
		constructed: makeBitMapDescriptor(kConstructed),
		sync: makeBitMapDescriptor(kSync),
		needReadable: makeBitMapDescriptor(kNeedReadable),
		emittedReadable: makeBitMapDescriptor(kEmittedReadable),
		readableListening: makeBitMapDescriptor(kReadableListening),
		resumeScheduled: makeBitMapDescriptor(kResumeScheduled),
		errorEmitted: makeBitMapDescriptor(kErrorEmitted),
		emitClose: makeBitMapDescriptor(kEmitClose),
		autoDestroy: makeBitMapDescriptor(kAutoDestroy),
		destroyed: makeBitMapDescriptor(kDestroyed),
		closed: makeBitMapDescriptor(kClosed),
		closeEmitted: makeBitMapDescriptor(kCloseEmitted),
		multiAwaitDrain: makeBitMapDescriptor(kMultiAwaitDrain),
		readingMore: makeBitMapDescriptor(kReadingMore),
		dataEmitted: makeBitMapDescriptor(kDataEmitted)
	});
	function ReadableState(options, stream, isDuplex) {
		if (typeof isDuplex !== "boolean") isDuplex = stream instanceof require_duplex();
		this.state = 6192;
		if (options && options.objectMode) this.state |= kObjectMode;
		if (isDuplex && options && options.readableObjectMode) this.state |= kObjectMode;
		this.highWaterMark = options ? getHighWaterMark(this, options, "readableHighWaterMark", isDuplex) : getDefaultHighWaterMark(false);
		this.buffer = new BufferList();
		this.length = 0;
		this.pipes = [];
		this.flowing = null;
		this[kPaused] = null;
		if (options && options.emitClose === false) this.state &= -2049;
		if (options && options.autoDestroy === false) this.state &= -4097;
		this.errored = null;
		this.defaultEncoding = options && options.defaultEncoding || "utf8";
		this.awaitDrainWriters = null;
		this.decoder = null;
		this.encoding = null;
		if (options && options.encoding) {
			this.decoder = new StringDecoder(options.encoding);
			this.encoding = options.encoding;
		}
	}
	function Readable(options) {
		if (!(this instanceof Readable)) return new Readable(options);
		const isDuplex = this instanceof require_duplex();
		this._readableState = new ReadableState(options, this, isDuplex);
		if (options) {
			if (typeof options.read === "function") this._read = options.read;
			if (typeof options.destroy === "function") this._destroy = options.destroy;
			if (typeof options.construct === "function") this._construct = options.construct;
			if (options.signal && !isDuplex) addAbortSignal(options.signal, this);
		}
		Stream.call(this, options);
		destroyImpl.construct(this, () => {
			if (this._readableState.needReadable) maybeReadMore(this, this._readableState);
		});
	}
	Readable.prototype.destroy = destroyImpl.destroy;
	Readable.prototype._undestroy = destroyImpl.undestroy;
	Readable.prototype._destroy = function(err, cb) {
		cb(err);
	};
	Readable.prototype[EE.captureRejectionSymbol] = function(err) {
		this.destroy(err);
	};
	Readable.prototype[SymbolAsyncDispose] = function() {
		let error;
		if (!this.destroyed) {
			error = this.readableEnded ? null : new AbortError();
			this.destroy(error);
		}
		return new Promise((resolve, reject) => eos(this, (err) => err && err !== error ? reject(err) : resolve(null)));
	};
	Readable.prototype.push = function(chunk, encoding) {
		return readableAddChunk(this, chunk, encoding, false);
	};
	Readable.prototype.unshift = function(chunk, encoding) {
		return readableAddChunk(this, chunk, encoding, true);
	};
	function readableAddChunk(stream, chunk, encoding, addToFront) {
		debug("readableAddChunk", chunk);
		const state = stream._readableState;
		let err;
		if ((state.state & kObjectMode) === 0) {
			if (typeof chunk === "string") {
				encoding = encoding || state.defaultEncoding;
				if (state.encoding !== encoding) {
					if (addToFront && state.encoding) chunk = Buffer.from(chunk, encoding).toString(state.encoding);
					else {
						chunk = Buffer.from(chunk, encoding);
						encoding = "";
					}
				}
			} else if (chunk instanceof Buffer) encoding = "";
			else if (Stream._isUint8Array(chunk)) {
				chunk = Stream._uint8ArrayToBuffer(chunk);
				encoding = "";
			} else if (chunk != null) err = new ERR_INVALID_ARG_TYPE("chunk", [
				"string",
				"Buffer",
				"Uint8Array"
			], chunk);
		}
		if (err) errorOrDestroy(stream, err);
		else if (chunk === null) {
			state.state &= -9;
			onEofChunk(stream, state);
		} else if ((state.state & kObjectMode) !== 0 || chunk && chunk.length > 0) {
			if (addToFront) {
				if ((state.state & kEndEmitted) !== 0) errorOrDestroy(stream, new ERR_STREAM_UNSHIFT_AFTER_END_EVENT());
				else if (state.destroyed || state.errored) return false;
				else addChunk(stream, state, chunk, true);
			} else if (state.ended) errorOrDestroy(stream, new ERR_STREAM_PUSH_AFTER_EOF());
			else if (state.destroyed || state.errored) return false;
			else {
				state.state &= -9;
				if (state.decoder && !encoding) {
					chunk = state.decoder.write(chunk);
					if (state.objectMode || chunk.length !== 0) addChunk(stream, state, chunk, false);
					else maybeReadMore(stream, state);
				} else addChunk(stream, state, chunk, false);
			}
		} else if (!addToFront) {
			state.state &= -9;
			maybeReadMore(stream, state);
		}
		return !state.ended && (state.length < state.highWaterMark || state.length === 0);
	}
	function addChunk(stream, state, chunk, addToFront) {
		if (state.flowing && state.length === 0 && !state.sync && stream.listenerCount("data") > 0) {
			if ((state.state & kMultiAwaitDrain) !== 0) state.awaitDrainWriters.clear();
			else state.awaitDrainWriters = null;
			state.dataEmitted = true;
			stream.emit("data", chunk);
		} else {
			state.length += state.objectMode ? 1 : chunk.length;
			if (addToFront) state.buffer.unshift(chunk);
			else state.buffer.push(chunk);
			if ((state.state & kNeedReadable) !== 0) emitReadable(stream);
		}
		maybeReadMore(stream, state);
	}
	Readable.prototype.isPaused = function() {
		const state = this._readableState;
		return state[kPaused] === true || state.flowing === false;
	};
	Readable.prototype.setEncoding = function(enc) {
		const decoder = new StringDecoder(enc);
		this._readableState.decoder = decoder;
		this._readableState.encoding = this._readableState.decoder.encoding;
		const buffer = this._readableState.buffer;
		let content = "";
		for (const data of buffer) content += decoder.write(data);
		buffer.clear();
		if (content !== "") buffer.push(content);
		this._readableState.length = content.length;
		return this;
	};
	const MAX_HWM = 1073741824;
	function computeNewHighWaterMark(n) {
		if (n > MAX_HWM) throw new ERR_OUT_OF_RANGE("size", "<= 1GiB", n);
		else {
			n--;
			n |= n >>> 1;
			n |= n >>> 2;
			n |= n >>> 4;
			n |= n >>> 8;
			n |= n >>> 16;
			n++;
		}
		return n;
	}
	function howMuchToRead(n, state) {
		if (n <= 0 || state.length === 0 && state.ended) return 0;
		if ((state.state & kObjectMode) !== 0) return 1;
		if (NumberIsNaN(n)) {
			if (state.flowing && state.length) return state.buffer.first().length;
			return state.length;
		}
		if (n <= state.length) return n;
		return state.ended ? state.length : 0;
	}
	Readable.prototype.read = function(n) {
		debug("read", n);
		if (n === void 0) n = NaN;
		else if (!NumberIsInteger(n)) n = NumberParseInt(n, 10);
		const state = this._readableState;
		const nOrig = n;
		if (n > state.highWaterMark) state.highWaterMark = computeNewHighWaterMark(n);
		if (n !== 0) state.state &= -129;
		if (n === 0 && state.needReadable && ((state.highWaterMark !== 0 ? state.length >= state.highWaterMark : state.length > 0) || state.ended)) {
			debug("read: emitReadable", state.length, state.ended);
			if (state.length === 0 && state.ended) endReadable(this);
			else emitReadable(this);
			return null;
		}
		n = howMuchToRead(n, state);
		if (n === 0 && state.ended) {
			if (state.length === 0) endReadable(this);
			return null;
		}
		let doRead = (state.state & kNeedReadable) !== 0;
		debug("need readable", doRead);
		if (state.length === 0 || state.length - n < state.highWaterMark) {
			doRead = true;
			debug("length less than watermark", doRead);
		}
		if (state.ended || state.reading || state.destroyed || state.errored || !state.constructed) {
			doRead = false;
			debug("reading, ended or constructing", doRead);
		} else if (doRead) {
			debug("do read");
			state.state |= 40;
			if (state.length === 0) state.state |= kNeedReadable;
			try {
				this._read(state.highWaterMark);
			} catch (err) {
				errorOrDestroy(this, err);
			}
			state.state &= -33;
			if (!state.reading) n = howMuchToRead(nOrig, state);
		}
		let ret;
		if (n > 0) ret = fromList(n, state);
		else ret = null;
		if (ret === null) {
			state.needReadable = state.length <= state.highWaterMark;
			n = 0;
		} else {
			state.length -= n;
			if (state.multiAwaitDrain) state.awaitDrainWriters.clear();
			else state.awaitDrainWriters = null;
		}
		if (state.length === 0) {
			if (!state.ended) state.needReadable = true;
			if (nOrig !== n && state.ended) endReadable(this);
		}
		if (ret !== null && !state.errorEmitted && !state.closeEmitted) {
			state.dataEmitted = true;
			this.emit("data", ret);
		}
		return ret;
	};
	function onEofChunk(stream, state) {
		debug("onEofChunk");
		if (state.ended) return;
		if (state.decoder) {
			const chunk = state.decoder.end();
			if (chunk && chunk.length) {
				state.buffer.push(chunk);
				state.length += state.objectMode ? 1 : chunk.length;
			}
		}
		state.ended = true;
		if (state.sync) emitReadable(stream);
		else {
			state.needReadable = false;
			state.emittedReadable = true;
			emitReadable_(stream);
		}
	}
	function emitReadable(stream) {
		const state = stream._readableState;
		debug("emitReadable", state.needReadable, state.emittedReadable);
		state.needReadable = false;
		if (!state.emittedReadable) {
			debug("emitReadable", state.flowing);
			state.emittedReadable = true;
			process.nextTick(emitReadable_, stream);
		}
	}
	function emitReadable_(stream) {
		const state = stream._readableState;
		debug("emitReadable_", state.destroyed, state.length, state.ended);
		if (!state.destroyed && !state.errored && (state.length || state.ended)) {
			stream.emit("readable");
			state.emittedReadable = false;
		}
		state.needReadable = !state.flowing && !state.ended && state.length <= state.highWaterMark;
		flow(stream);
	}
	function maybeReadMore(stream, state) {
		if (!state.readingMore && state.constructed) {
			state.readingMore = true;
			process.nextTick(maybeReadMore_, stream, state);
		}
	}
	function maybeReadMore_(stream, state) {
		while (!state.reading && !state.ended && (state.length < state.highWaterMark || state.flowing && state.length === 0)) {
			const len = state.length;
			debug("maybeReadMore read 0");
			stream.read(0);
			if (len === state.length) break;
		}
		state.readingMore = false;
	}
	Readable.prototype._read = function(n) {
		throw new ERR_METHOD_NOT_IMPLEMENTED("_read()");
	};
	Readable.prototype.pipe = function(dest, pipeOpts) {
		const src = this;
		const state = this._readableState;
		if (state.pipes.length === 1) {
			if (!state.multiAwaitDrain) {
				state.multiAwaitDrain = true;
				state.awaitDrainWriters = new SafeSet(state.awaitDrainWriters ? [state.awaitDrainWriters] : []);
			}
		}
		state.pipes.push(dest);
		debug("pipe count=%d opts=%j", state.pipes.length, pipeOpts);
		const endFn = (!pipeOpts || pipeOpts.end !== false) && dest !== process.stdout && dest !== process.stderr ? onend : unpipe;
		if (state.endEmitted) process.nextTick(endFn);
		else src.once("end", endFn);
		dest.on("unpipe", onunpipe);
		function onunpipe(readable, unpipeInfo) {
			debug("onunpipe");
			if (readable === src) {
				if (unpipeInfo && unpipeInfo.hasUnpiped === false) {
					unpipeInfo.hasUnpiped = true;
					cleanup();
				}
			}
		}
		function onend() {
			debug("onend");
			dest.end();
		}
		let ondrain;
		let cleanedUp = false;
		function cleanup() {
			debug("cleanup");
			dest.removeListener("close", onclose);
			dest.removeListener("finish", onfinish);
			if (ondrain) dest.removeListener("drain", ondrain);
			dest.removeListener("error", onerror);
			dest.removeListener("unpipe", onunpipe);
			src.removeListener("end", onend);
			src.removeListener("end", unpipe);
			src.removeListener("data", ondata);
			cleanedUp = true;
			if (ondrain && state.awaitDrainWriters && (!dest._writableState || dest._writableState.needDrain)) ondrain();
		}
		function pause() {
			if (!cleanedUp) {
				if (state.pipes.length === 1 && state.pipes[0] === dest) {
					debug("false write response, pause", 0);
					state.awaitDrainWriters = dest;
					state.multiAwaitDrain = false;
				} else if (state.pipes.length > 1 && state.pipes.includes(dest)) {
					debug("false write response, pause", state.awaitDrainWriters.size);
					state.awaitDrainWriters.add(dest);
				}
				src.pause();
			}
			if (!ondrain) {
				ondrain = pipeOnDrain(src, dest);
				dest.on("drain", ondrain);
			}
		}
		src.on("data", ondata);
		function ondata(chunk) {
			debug("ondata");
			const ret = dest.write(chunk);
			debug("dest.write", ret);
			if (ret === false) pause();
		}
		function onerror(er) {
			debug("onerror", er);
			unpipe();
			dest.removeListener("error", onerror);
			if (dest.listenerCount("error") === 0) {
				const s = dest._writableState || dest._readableState;
				if (s && !s.errorEmitted) errorOrDestroy(dest, er);
				else dest.emit("error", er);
			}
		}
		prependListener(dest, "error", onerror);
		function onclose() {
			dest.removeListener("finish", onfinish);
			unpipe();
		}
		dest.once("close", onclose);
		function onfinish() {
			debug("onfinish");
			dest.removeListener("close", onclose);
			unpipe();
		}
		dest.once("finish", onfinish);
		function unpipe() {
			debug("unpipe");
			src.unpipe(dest);
		}
		dest.emit("pipe", src);
		if (dest.writableNeedDrain === true) pause();
		else if (!state.flowing) {
			debug("pipe resume");
			src.resume();
		}
		return dest;
	};
	function pipeOnDrain(src, dest) {
		return function pipeOnDrainFunctionResult() {
			const state = src._readableState;
			if (state.awaitDrainWriters === dest) {
				debug("pipeOnDrain", 1);
				state.awaitDrainWriters = null;
			} else if (state.multiAwaitDrain) {
				debug("pipeOnDrain", state.awaitDrainWriters.size);
				state.awaitDrainWriters.delete(dest);
			}
			if ((!state.awaitDrainWriters || state.awaitDrainWriters.size === 0) && src.listenerCount("data")) src.resume();
		};
	}
	Readable.prototype.unpipe = function(dest) {
		const state = this._readableState;
		const unpipeInfo = { hasUnpiped: false };
		if (state.pipes.length === 0) return this;
		if (!dest) {
			const dests = state.pipes;
			state.pipes = [];
			this.pause();
			for (let i = 0; i < dests.length; i++) dests[i].emit("unpipe", this, { hasUnpiped: false });
			return this;
		}
		const index = ArrayPrototypeIndexOf(state.pipes, dest);
		if (index === -1) return this;
		state.pipes.splice(index, 1);
		if (state.pipes.length === 0) this.pause();
		dest.emit("unpipe", this, unpipeInfo);
		return this;
	};
	Readable.prototype.on = function(ev, fn) {
		const res = Stream.prototype.on.call(this, ev, fn);
		const state = this._readableState;
		if (ev === "data") {
			state.readableListening = this.listenerCount("readable") > 0;
			if (state.flowing !== false) this.resume();
		} else if (ev === "readable") {
			if (!state.endEmitted && !state.readableListening) {
				state.readableListening = state.needReadable = true;
				state.flowing = false;
				state.emittedReadable = false;
				debug("on readable", state.length, state.reading);
				if (state.length) emitReadable(this);
				else if (!state.reading) process.nextTick(nReadingNextTick, this);
			}
		}
		return res;
	};
	Readable.prototype.addListener = Readable.prototype.on;
	Readable.prototype.removeListener = function(ev, fn) {
		const res = Stream.prototype.removeListener.call(this, ev, fn);
		if (ev === "readable") process.nextTick(updateReadableListening, this);
		return res;
	};
	Readable.prototype.off = Readable.prototype.removeListener;
	Readable.prototype.removeAllListeners = function(ev) {
		const res = Stream.prototype.removeAllListeners.apply(this, arguments);
		if (ev === "readable" || ev === void 0) process.nextTick(updateReadableListening, this);
		return res;
	};
	function updateReadableListening(self) {
		const state = self._readableState;
		state.readableListening = self.listenerCount("readable") > 0;
		if (state.resumeScheduled && state[kPaused] === false) state.flowing = true;
		else if (self.listenerCount("data") > 0) self.resume();
		else if (!state.readableListening) state.flowing = null;
	}
	function nReadingNextTick(self) {
		debug("readable nexttick read 0");
		self.read(0);
	}
	Readable.prototype.resume = function() {
		const state = this._readableState;
		if (!state.flowing) {
			debug("resume");
			state.flowing = !state.readableListening;
			resume(this, state);
		}
		state[kPaused] = false;
		return this;
	};
	function resume(stream, state) {
		if (!state.resumeScheduled) {
			state.resumeScheduled = true;
			process.nextTick(resume_, stream, state);
		}
	}
	function resume_(stream, state) {
		debug("resume", state.reading);
		if (!state.reading) stream.read(0);
		state.resumeScheduled = false;
		stream.emit("resume");
		flow(stream);
		if (state.flowing && !state.reading) stream.read(0);
	}
	Readable.prototype.pause = function() {
		debug("call pause flowing=%j", this._readableState.flowing);
		if (this._readableState.flowing !== false) {
			debug("pause");
			this._readableState.flowing = false;
			this.emit("pause");
		}
		this._readableState[kPaused] = true;
		return this;
	};
	function flow(stream) {
		const state = stream._readableState;
		debug("flow", state.flowing);
		while (state.flowing && stream.read() !== null);
	}
	Readable.prototype.wrap = function(stream) {
		let paused = false;
		stream.on("data", (chunk) => {
			if (!this.push(chunk) && stream.pause) {
				paused = true;
				stream.pause();
			}
		});
		stream.on("end", () => {
			this.push(null);
		});
		stream.on("error", (err) => {
			errorOrDestroy(this, err);
		});
		stream.on("close", () => {
			this.destroy();
		});
		stream.on("destroy", () => {
			this.destroy();
		});
		this._read = () => {
			if (paused && stream.resume) {
				paused = false;
				stream.resume();
			}
		};
		const streamKeys = ObjectKeys(stream);
		for (let j = 1; j < streamKeys.length; j++) {
			const i = streamKeys[j];
			if (this[i] === void 0 && typeof stream[i] === "function") this[i] = stream[i].bind(stream);
		}
		return this;
	};
	Readable.prototype[SymbolAsyncIterator] = function() {
		return streamToAsyncIterator(this);
	};
	Readable.prototype.iterator = function(options) {
		if (options !== void 0) validateObject(options, "options");
		return streamToAsyncIterator(this, options);
	};
	function streamToAsyncIterator(stream, options) {
		if (typeof stream.read !== "function") stream = Readable.wrap(stream, { objectMode: true });
		const iter = createAsyncIterator(stream, options);
		iter.stream = stream;
		return iter;
	}
	async function* createAsyncIterator(stream, options) {
		let callback = nop;
		function next(resolve) {
			if (this === stream) {
				callback();
				callback = nop;
			} else callback = resolve;
		}
		stream.on("readable", next);
		let error;
		const cleanup = eos(stream, { writable: false }, (err) => {
			error = err ? aggregateTwoErrors(error, err) : null;
			callback();
			callback = nop;
		});
		try {
			while (true) {
				const chunk = stream.destroyed ? null : stream.read();
				if (chunk !== null) yield chunk;
				else if (error) throw error;
				else if (error === null) return;
				else await new Promise(next);
			}
		} catch (err) {
			error = aggregateTwoErrors(error, err);
			throw error;
		} finally {
			if ((error || (options === null || options === void 0 ? void 0 : options.destroyOnReturn) !== false) && (error === void 0 || stream._readableState.autoDestroy)) destroyImpl.destroyer(stream, null);
			else {
				stream.off("readable", next);
				cleanup();
			}
		}
	}
	ObjectDefineProperties(Readable.prototype, {
		readable: {
			__proto__: null,
			get() {
				const r = this._readableState;
				return !!r && r.readable !== false && !r.destroyed && !r.errorEmitted && !r.endEmitted;
			},
			set(val) {
				if (this._readableState) this._readableState.readable = !!val;
			}
		},
		readableDidRead: {
			__proto__: null,
			enumerable: false,
			get: function() {
				return this._readableState.dataEmitted;
			}
		},
		readableAborted: {
			__proto__: null,
			enumerable: false,
			get: function() {
				return !!(this._readableState.readable !== false && (this._readableState.destroyed || this._readableState.errored) && !this._readableState.endEmitted);
			}
		},
		readableHighWaterMark: {
			__proto__: null,
			enumerable: false,
			get: function() {
				return this._readableState.highWaterMark;
			}
		},
		readableBuffer: {
			__proto__: null,
			enumerable: false,
			get: function() {
				return this._readableState && this._readableState.buffer;
			}
		},
		readableFlowing: {
			__proto__: null,
			enumerable: false,
			get: function() {
				return this._readableState.flowing;
			},
			set: function(state) {
				if (this._readableState) this._readableState.flowing = state;
			}
		},
		readableLength: {
			__proto__: null,
			enumerable: false,
			get() {
				return this._readableState.length;
			}
		},
		readableObjectMode: {
			__proto__: null,
			enumerable: false,
			get() {
				return this._readableState ? this._readableState.objectMode : false;
			}
		},
		readableEncoding: {
			__proto__: null,
			enumerable: false,
			get() {
				return this._readableState ? this._readableState.encoding : null;
			}
		},
		errored: {
			__proto__: null,
			enumerable: false,
			get() {
				return this._readableState ? this._readableState.errored : null;
			}
		},
		closed: {
			__proto__: null,
			get() {
				return this._readableState ? this._readableState.closed : false;
			}
		},
		destroyed: {
			__proto__: null,
			enumerable: false,
			get() {
				return this._readableState ? this._readableState.destroyed : false;
			},
			set(value) {
				if (!this._readableState) return;
				this._readableState.destroyed = value;
			}
		},
		readableEnded: {
			__proto__: null,
			enumerable: false,
			get() {
				return this._readableState ? this._readableState.endEmitted : false;
			}
		}
	});
	ObjectDefineProperties(ReadableState.prototype, {
		pipesCount: {
			__proto__: null,
			get() {
				return this.pipes.length;
			}
		},
		paused: {
			__proto__: null,
			get() {
				return this[kPaused] !== false;
			},
			set(value) {
				this[kPaused] = !!value;
			}
		}
	});
	Readable._fromList = fromList;
	function fromList(n, state) {
		if (state.length === 0) return null;
		let ret;
		if (state.objectMode) ret = state.buffer.shift();
		else if (!n || n >= state.length) {
			if (state.decoder) ret = state.buffer.join("");
			else if (state.buffer.length === 1) ret = state.buffer.first();
			else ret = state.buffer.concat(state.length);
			state.buffer.clear();
		} else ret = state.buffer.consume(n, state.decoder);
		return ret;
	}
	function endReadable(stream) {
		const state = stream._readableState;
		debug("endReadable", state.endEmitted);
		if (!state.endEmitted) {
			state.ended = true;
			process.nextTick(endReadableNT, state, stream);
		}
	}
	function endReadableNT(state, stream) {
		debug("endReadableNT", state.endEmitted, state.length);
		if (!state.errored && !state.closeEmitted && !state.endEmitted && state.length === 0) {
			state.endEmitted = true;
			stream.emit("end");
			if (stream.writable && stream.allowHalfOpen === false) process.nextTick(endWritableNT, stream);
			else if (state.autoDestroy) {
				const wState = stream._writableState;
				if (!wState || wState.autoDestroy && (wState.finished || wState.writable === false)) stream.destroy();
			}
		}
	}
	function endWritableNT(stream) {
		if (stream.writable && !stream.writableEnded && !stream.destroyed) stream.end();
	}
	Readable.from = function(iterable, opts) {
		return from(Readable, iterable, opts);
	};
	let webStreamsAdapters;
	function lazyWebStreams() {
		if (webStreamsAdapters === void 0) webStreamsAdapters = {};
		return webStreamsAdapters;
	}
	Readable.fromWeb = function(readableStream, options) {
		return lazyWebStreams().newStreamReadableFromReadableStream(readableStream, options);
	};
	Readable.toWeb = function(streamReadable, options) {
		return lazyWebStreams().newReadableStreamFromStreamReadable(streamReadable, options);
	};
	Readable.wrap = function(src, options) {
		var _ref, _src$readableObjectMo;
		return new Readable({
			objectMode: (_ref = (_src$readableObjectMo = src.readableObjectMode) !== null && _src$readableObjectMo !== void 0 ? _src$readableObjectMo : src.objectMode) !== null && _ref !== void 0 ? _ref : true,
			...options,
			destroy(err, callback) {
				destroyImpl.destroyer(src, err);
				callback(err);
			}
		}).wrap(src);
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/readable-stream@4.8.0/node_modules/readable-stream/lib/internal/streams/writable.js
var require_writable = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const process = require_process();
	const { ArrayPrototypeSlice, Error, FunctionPrototypeSymbolHasInstance, ObjectDefineProperty, ObjectDefineProperties, ObjectSetPrototypeOf, StringPrototypeToLowerCase, Symbol, SymbolHasInstance } = require_primordials();
	module.exports = Writable;
	Writable.WritableState = WritableState;
	const { EventEmitter: EE } = require__require_as_import_events();
	const Stream = require_legacy().Stream;
	const { Buffer } = require__require_as_import_buffer();
	const destroyImpl = require_destroy();
	const { addAbortSignal } = require_add_abort_signal();
	const { getHighWaterMark, getDefaultHighWaterMark } = require_state();
	const { ERR_INVALID_ARG_TYPE, ERR_METHOD_NOT_IMPLEMENTED, ERR_MULTIPLE_CALLBACK, ERR_STREAM_CANNOT_PIPE, ERR_STREAM_DESTROYED, ERR_STREAM_ALREADY_FINISHED, ERR_STREAM_NULL_VALUES, ERR_STREAM_WRITE_AFTER_END, ERR_UNKNOWN_ENCODING } = require_errors().codes;
	const { errorOrDestroy } = destroyImpl;
	ObjectSetPrototypeOf(Writable.prototype, Stream.prototype);
	ObjectSetPrototypeOf(Writable, Stream);
	function nop() {}
	const kOnFinished = Symbol("kOnFinished");
	function WritableState(options, stream, isDuplex) {
		if (typeof isDuplex !== "boolean") isDuplex = stream instanceof require_duplex();
		this.objectMode = !!(options && options.objectMode);
		if (isDuplex) this.objectMode = this.objectMode || !!(options && options.writableObjectMode);
		this.highWaterMark = options ? getHighWaterMark(this, options, "writableHighWaterMark", isDuplex) : getDefaultHighWaterMark(false);
		this.finalCalled = false;
		this.needDrain = false;
		this.ending = false;
		this.ended = false;
		this.finished = false;
		this.destroyed = false;
		const noDecode = !!(options && options.decodeStrings === false);
		this.decodeStrings = !noDecode;
		this.defaultEncoding = options && options.defaultEncoding || "utf8";
		this.length = 0;
		this.writing = false;
		this.corked = 0;
		this.sync = true;
		this.bufferProcessing = false;
		this.onwrite = onwrite.bind(void 0, stream);
		this.writecb = null;
		this.writelen = 0;
		this.afterWriteTickInfo = null;
		resetBuffer(this);
		this.pendingcb = 0;
		this.constructed = true;
		this.prefinished = false;
		this.errorEmitted = false;
		this.emitClose = !options || options.emitClose !== false;
		this.autoDestroy = !options || options.autoDestroy !== false;
		this.errored = null;
		this.closed = false;
		this.closeEmitted = false;
		this[kOnFinished] = [];
	}
	function resetBuffer(state) {
		state.buffered = [];
		state.bufferedIndex = 0;
		state.allBuffers = true;
		state.allNoop = true;
	}
	WritableState.prototype.getBuffer = function getBuffer() {
		return ArrayPrototypeSlice(this.buffered, this.bufferedIndex);
	};
	ObjectDefineProperty(WritableState.prototype, "bufferedRequestCount", {
		__proto__: null,
		get() {
			return this.buffered.length - this.bufferedIndex;
		}
	});
	function Writable(options) {
		const isDuplex = this instanceof require_duplex();
		if (!isDuplex && !FunctionPrototypeSymbolHasInstance(Writable, this)) return new Writable(options);
		this._writableState = new WritableState(options, this, isDuplex);
		if (options) {
			if (typeof options.write === "function") this._write = options.write;
			if (typeof options.writev === "function") this._writev = options.writev;
			if (typeof options.destroy === "function") this._destroy = options.destroy;
			if (typeof options.final === "function") this._final = options.final;
			if (typeof options.construct === "function") this._construct = options.construct;
			if (options.signal) addAbortSignal(options.signal, this);
		}
		Stream.call(this, options);
		destroyImpl.construct(this, () => {
			const state = this._writableState;
			if (!state.writing) clearBuffer(this, state);
			finishMaybe(this, state);
		});
	}
	ObjectDefineProperty(Writable, SymbolHasInstance, {
		__proto__: null,
		value: function(object) {
			if (FunctionPrototypeSymbolHasInstance(this, object)) return true;
			if (this !== Writable) return false;
			return object && object._writableState instanceof WritableState;
		}
	});
	Writable.prototype.pipe = function() {
		errorOrDestroy(this, new ERR_STREAM_CANNOT_PIPE());
	};
	function _write(stream, chunk, encoding, cb) {
		const state = stream._writableState;
		if (typeof encoding === "function") {
			cb = encoding;
			encoding = state.defaultEncoding;
		} else {
			if (!encoding) encoding = state.defaultEncoding;
			else if (encoding !== "buffer" && !Buffer.isEncoding(encoding)) throw new ERR_UNKNOWN_ENCODING(encoding);
			if (typeof cb !== "function") cb = nop;
		}
		if (chunk === null) throw new ERR_STREAM_NULL_VALUES();
		else if (!state.objectMode) {
			if (typeof chunk === "string") {
				if (state.decodeStrings !== false) {
					chunk = Buffer.from(chunk, encoding);
					encoding = "buffer";
				}
			} else if (chunk instanceof Buffer) encoding = "buffer";
			else if (Stream._isUint8Array(chunk)) {
				chunk = Stream._uint8ArrayToBuffer(chunk);
				encoding = "buffer";
			} else throw new ERR_INVALID_ARG_TYPE("chunk", [
				"string",
				"Buffer",
				"Uint8Array"
			], chunk);
		}
		let err;
		if (state.ending) err = new ERR_STREAM_WRITE_AFTER_END();
		else if (state.destroyed) err = new ERR_STREAM_DESTROYED("write");
		if (err) {
			process.nextTick(cb, err);
			errorOrDestroy(stream, err, true);
			return err;
		}
		state.pendingcb++;
		return writeOrBuffer(stream, state, chunk, encoding, cb);
	}
	Writable.prototype.write = function(chunk, encoding, cb) {
		return _write(this, chunk, encoding, cb) === true;
	};
	Writable.prototype.cork = function() {
		this._writableState.corked++;
	};
	Writable.prototype.uncork = function() {
		const state = this._writableState;
		if (state.corked) {
			state.corked--;
			if (!state.writing) clearBuffer(this, state);
		}
	};
	Writable.prototype.setDefaultEncoding = function setDefaultEncoding(encoding) {
		if (typeof encoding === "string") encoding = StringPrototypeToLowerCase(encoding);
		if (!Buffer.isEncoding(encoding)) throw new ERR_UNKNOWN_ENCODING(encoding);
		this._writableState.defaultEncoding = encoding;
		return this;
	};
	function writeOrBuffer(stream, state, chunk, encoding, callback) {
		const len = state.objectMode ? 1 : chunk.length;
		state.length += len;
		const ret = state.length < state.highWaterMark;
		if (!ret) state.needDrain = true;
		if (state.writing || state.corked || state.errored || !state.constructed) {
			state.buffered.push({
				chunk,
				encoding,
				callback
			});
			if (state.allBuffers && encoding !== "buffer") state.allBuffers = false;
			if (state.allNoop && callback !== nop) state.allNoop = false;
		} else {
			state.writelen = len;
			state.writecb = callback;
			state.writing = true;
			state.sync = true;
			stream._write(chunk, encoding, state.onwrite);
			state.sync = false;
		}
		return ret && !state.errored && !state.destroyed;
	}
	function doWrite(stream, state, writev, len, chunk, encoding, cb) {
		state.writelen = len;
		state.writecb = cb;
		state.writing = true;
		state.sync = true;
		if (state.destroyed) state.onwrite(new ERR_STREAM_DESTROYED("write"));
		else if (writev) stream._writev(chunk, state.onwrite);
		else stream._write(chunk, encoding, state.onwrite);
		state.sync = false;
	}
	function onwriteError(stream, state, er, cb) {
		--state.pendingcb;
		cb(er);
		errorBuffer(state);
		errorOrDestroy(stream, er);
	}
	function onwrite(stream, er) {
		const state = stream._writableState;
		const sync = state.sync;
		const cb = state.writecb;
		if (typeof cb !== "function") {
			errorOrDestroy(stream, new ERR_MULTIPLE_CALLBACK());
			return;
		}
		state.writing = false;
		state.writecb = null;
		state.length -= state.writelen;
		state.writelen = 0;
		if (er) {
			er.stack;
			if (!state.errored) state.errored = er;
			if (stream._readableState && !stream._readableState.errored) stream._readableState.errored = er;
			if (sync) process.nextTick(onwriteError, stream, state, er, cb);
			else onwriteError(stream, state, er, cb);
		} else {
			if (state.buffered.length > state.bufferedIndex) clearBuffer(stream, state);
			if (sync) {
				if (state.afterWriteTickInfo !== null && state.afterWriteTickInfo.cb === cb) state.afterWriteTickInfo.count++;
				else {
					state.afterWriteTickInfo = {
						count: 1,
						cb,
						stream,
						state
					};
					process.nextTick(afterWriteTick, state.afterWriteTickInfo);
				}
			} else afterWrite(stream, state, 1, cb);
		}
	}
	function afterWriteTick({ stream, state, count, cb }) {
		state.afterWriteTickInfo = null;
		return afterWrite(stream, state, count, cb);
	}
	function afterWrite(stream, state, count, cb) {
		if (!state.ending && !stream.destroyed && state.length === 0 && state.needDrain) {
			state.needDrain = false;
			stream.emit("drain");
		}
		while (count-- > 0) {
			state.pendingcb--;
			cb();
		}
		if (state.destroyed) errorBuffer(state);
		finishMaybe(stream, state);
	}
	function errorBuffer(state) {
		if (state.writing) return;
		for (let n = state.bufferedIndex; n < state.buffered.length; ++n) {
			var _state$errored;
			const { chunk, callback } = state.buffered[n];
			const len = state.objectMode ? 1 : chunk.length;
			state.length -= len;
			callback((_state$errored = state.errored) !== null && _state$errored !== void 0 ? _state$errored : new ERR_STREAM_DESTROYED("write"));
		}
		const onfinishCallbacks = state[kOnFinished].splice(0);
		for (let i = 0; i < onfinishCallbacks.length; i++) {
			var _state$errored2;
			onfinishCallbacks[i]((_state$errored2 = state.errored) !== null && _state$errored2 !== void 0 ? _state$errored2 : new ERR_STREAM_DESTROYED("end"));
		}
		resetBuffer(state);
	}
	function clearBuffer(stream, state) {
		if (state.corked || state.bufferProcessing || state.destroyed || !state.constructed) return;
		const { buffered, bufferedIndex, objectMode } = state;
		const bufferedLength = buffered.length - bufferedIndex;
		if (!bufferedLength) return;
		let i = bufferedIndex;
		state.bufferProcessing = true;
		if (bufferedLength > 1 && stream._writev) {
			state.pendingcb -= bufferedLength - 1;
			const callback = state.allNoop ? nop : (err) => {
				for (let n = i; n < buffered.length; ++n) buffered[n].callback(err);
			};
			const chunks = state.allNoop && i === 0 ? buffered : ArrayPrototypeSlice(buffered, i);
			chunks.allBuffers = state.allBuffers;
			doWrite(stream, state, true, state.length, chunks, "", callback);
			resetBuffer(state);
		} else {
			do {
				const { chunk, encoding, callback } = buffered[i];
				buffered[i++] = null;
				doWrite(stream, state, false, objectMode ? 1 : chunk.length, chunk, encoding, callback);
			} while (i < buffered.length && !state.writing);
			if (i === buffered.length) resetBuffer(state);
			else if (i > 256) {
				buffered.splice(0, i);
				state.bufferedIndex = 0;
			} else state.bufferedIndex = i;
		}
		state.bufferProcessing = false;
	}
	Writable.prototype._write = function(chunk, encoding, cb) {
		if (this._writev) this._writev([{
			chunk,
			encoding
		}], cb);
		else throw new ERR_METHOD_NOT_IMPLEMENTED("_write()");
	};
	Writable.prototype._writev = null;
	Writable.prototype.end = function(chunk, encoding, cb) {
		const state = this._writableState;
		if (typeof chunk === "function") {
			cb = chunk;
			chunk = null;
			encoding = null;
		} else if (typeof encoding === "function") {
			cb = encoding;
			encoding = null;
		}
		let err;
		if (chunk !== null && chunk !== void 0) {
			const ret = _write(this, chunk, encoding);
			if (ret instanceof Error) err = ret;
		}
		if (state.corked) {
			state.corked = 1;
			this.uncork();
		}
		if (err) {} else if (!state.errored && !state.ending) {
			state.ending = true;
			finishMaybe(this, state, true);
			state.ended = true;
		} else if (state.finished) err = new ERR_STREAM_ALREADY_FINISHED("end");
		else if (state.destroyed) err = new ERR_STREAM_DESTROYED("end");
		if (typeof cb === "function") {
			if (err || state.finished) process.nextTick(cb, err);
			else state[kOnFinished].push(cb);
		}
		return this;
	};
	function needFinish(state) {
		return state.ending && !state.destroyed && state.constructed && state.length === 0 && !state.errored && state.buffered.length === 0 && !state.finished && !state.writing && !state.errorEmitted && !state.closeEmitted;
	}
	function callFinal(stream, state) {
		let called = false;
		function onFinish(err) {
			if (called) {
				errorOrDestroy(stream, err !== null && err !== void 0 ? err : ERR_MULTIPLE_CALLBACK());
				return;
			}
			called = true;
			state.pendingcb--;
			if (err) {
				const onfinishCallbacks = state[kOnFinished].splice(0);
				for (let i = 0; i < onfinishCallbacks.length; i++) onfinishCallbacks[i](err);
				errorOrDestroy(stream, err, state.sync);
			} else if (needFinish(state)) {
				state.prefinished = true;
				stream.emit("prefinish");
				state.pendingcb++;
				process.nextTick(finish, stream, state);
			}
		}
		state.sync = true;
		state.pendingcb++;
		try {
			stream._final(onFinish);
		} catch (err) {
			onFinish(err);
		}
		state.sync = false;
	}
	function prefinish(stream, state) {
		if (!state.prefinished && !state.finalCalled) {
			if (typeof stream._final === "function" && !state.destroyed) {
				state.finalCalled = true;
				callFinal(stream, state);
			} else {
				state.prefinished = true;
				stream.emit("prefinish");
			}
		}
	}
	function finishMaybe(stream, state, sync) {
		if (needFinish(state)) {
			prefinish(stream, state);
			if (state.pendingcb === 0) {
				if (sync) {
					state.pendingcb++;
					process.nextTick((stream, state) => {
						if (needFinish(state)) finish(stream, state);
						else state.pendingcb--;
					}, stream, state);
				} else if (needFinish(state)) {
					state.pendingcb++;
					finish(stream, state);
				}
			}
		}
	}
	function finish(stream, state) {
		state.pendingcb--;
		state.finished = true;
		const onfinishCallbacks = state[kOnFinished].splice(0);
		for (let i = 0; i < onfinishCallbacks.length; i++) onfinishCallbacks[i]();
		stream.emit("finish");
		if (state.autoDestroy) {
			const rState = stream._readableState;
			if (!rState || rState.autoDestroy && (rState.endEmitted || rState.readable === false)) stream.destroy();
		}
	}
	ObjectDefineProperties(Writable.prototype, {
		closed: {
			__proto__: null,
			get() {
				return this._writableState ? this._writableState.closed : false;
			}
		},
		destroyed: {
			__proto__: null,
			get() {
				return this._writableState ? this._writableState.destroyed : false;
			},
			set(value) {
				if (this._writableState) this._writableState.destroyed = value;
			}
		},
		writable: {
			__proto__: null,
			get() {
				const w = this._writableState;
				return !!w && w.writable !== false && !w.destroyed && !w.errored && !w.ending && !w.ended;
			},
			set(val) {
				if (this._writableState) this._writableState.writable = !!val;
			}
		},
		writableFinished: {
			__proto__: null,
			get() {
				return this._writableState ? this._writableState.finished : false;
			}
		},
		writableObjectMode: {
			__proto__: null,
			get() {
				return this._writableState ? this._writableState.objectMode : false;
			}
		},
		writableBuffer: {
			__proto__: null,
			get() {
				return this._writableState && this._writableState.getBuffer();
			}
		},
		writableEnded: {
			__proto__: null,
			get() {
				return this._writableState ? this._writableState.ending : false;
			}
		},
		writableNeedDrain: {
			__proto__: null,
			get() {
				const wState = this._writableState;
				if (!wState) return false;
				return !wState.destroyed && !wState.ending && wState.needDrain;
			}
		},
		writableHighWaterMark: {
			__proto__: null,
			get() {
				return this._writableState && this._writableState.highWaterMark;
			}
		},
		writableCorked: {
			__proto__: null,
			get() {
				return this._writableState ? this._writableState.corked : 0;
			}
		},
		writableLength: {
			__proto__: null,
			get() {
				return this._writableState && this._writableState.length;
			}
		},
		errored: {
			__proto__: null,
			enumerable: false,
			get() {
				return this._writableState ? this._writableState.errored : null;
			}
		},
		writableAborted: {
			__proto__: null,
			enumerable: false,
			get: function() {
				return !!(this._writableState.writable !== false && (this._writableState.destroyed || this._writableState.errored) && !this._writableState.finished);
			}
		}
	});
	const destroy = destroyImpl.destroy;
	Writable.prototype.destroy = function(err, cb) {
		const state = this._writableState;
		if (!state.destroyed && (state.bufferedIndex < state.buffered.length || state[kOnFinished].length)) process.nextTick(errorBuffer, state);
		destroy.call(this, err, cb);
		return this;
	};
	Writable.prototype._undestroy = destroyImpl.undestroy;
	Writable.prototype._destroy = function(err, cb) {
		cb(err);
	};
	Writable.prototype[EE.captureRejectionSymbol] = function(err) {
		this.destroy(err);
	};
	let webStreamsAdapters;
	function lazyWebStreams() {
		if (webStreamsAdapters === void 0) webStreamsAdapters = {};
		return webStreamsAdapters;
	}
	Writable.fromWeb = function(writableStream, options) {
		return lazyWebStreams().newStreamWritableFromWritableStream(writableStream, options);
	};
	Writable.toWeb = function(streamWritable) {
		return lazyWebStreams().newWritableStreamFromStreamWritable(streamWritable);
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/readable-stream@4.8.0/node_modules/readable-stream/lib/internal/streams/duplexify.js
var require_duplexify = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const process = require_process();
	const bufferModule = require__require_as_import_buffer();
	const { isReadable, isWritable, isIterable, isNodeStream, isReadableNodeStream, isWritableNodeStream, isDuplexNodeStream, isReadableStream, isWritableStream } = require_utils();
	const eos = require_end_of_stream();
	const { AbortError, codes: { ERR_INVALID_ARG_TYPE, ERR_INVALID_RETURN_VALUE } } = require_errors();
	const { destroyer } = require_destroy();
	const Duplex = require_duplex();
	const Readable = require_readable();
	const Writable = require_writable();
	const { createDeferredPromise } = require_util();
	const from = require_from();
	const Blob = globalThis.Blob || bufferModule.Blob;
	const isBlob = typeof Blob !== "undefined" ? function isBlob(b) {
		return b instanceof Blob;
	} : function isBlob(b) {
		return false;
	};
	const AbortController = globalThis.AbortController || require__empty_module().AbortController;
	const { FunctionPrototypeCall } = require_primordials();
	var Duplexify = class extends Duplex {
		constructor(options) {
			super(options);
			if ((options === null || options === void 0 ? void 0 : options.readable) === false) {
				this._readableState.readable = false;
				this._readableState.ended = true;
				this._readableState.endEmitted = true;
			}
			if ((options === null || options === void 0 ? void 0 : options.writable) === false) {
				this._writableState.writable = false;
				this._writableState.ending = true;
				this._writableState.ended = true;
				this._writableState.finished = true;
			}
		}
	};
	module.exports = function duplexify(body, name) {
		if (isDuplexNodeStream(body)) return body;
		if (isReadableNodeStream(body)) return _duplexify({ readable: body });
		if (isWritableNodeStream(body)) return _duplexify({ writable: body });
		if (isNodeStream(body)) return _duplexify({
			writable: false,
			readable: false
		});
		if (isReadableStream(body)) return _duplexify({ readable: Readable.fromWeb(body) });
		if (isWritableStream(body)) return _duplexify({ writable: Writable.fromWeb(body) });
		if (typeof body === "function") {
			const { value, write, final, destroy } = fromAsyncGen(body);
			if (isIterable(value)) return from(Duplexify, value, {
				objectMode: true,
				write,
				final,
				destroy
			});
			const then = value === null || value === void 0 ? void 0 : value.then;
			if (typeof then === "function") {
				let d;
				const promise = FunctionPrototypeCall(then, value, (val) => {
					if (val != null) throw new ERR_INVALID_RETURN_VALUE("nully", "body", val);
				}, (err) => {
					destroyer(d, err);
				});
				return d = new Duplexify({
					objectMode: true,
					readable: false,
					write,
					final(cb) {
						final(async () => {
							try {
								await promise;
								process.nextTick(cb, null);
							} catch (err) {
								process.nextTick(cb, err);
							}
						});
					},
					destroy
				});
			}
			throw new ERR_INVALID_RETURN_VALUE("Iterable, AsyncIterable or AsyncFunction", name, value);
		}
		if (isBlob(body)) return duplexify(body.arrayBuffer());
		if (isIterable(body)) return from(Duplexify, body, {
			objectMode: true,
			writable: false
		});
		if (isReadableStream(body === null || body === void 0 ? void 0 : body.readable) && isWritableStream(body === null || body === void 0 ? void 0 : body.writable)) return Duplexify.fromWeb(body);
		if (typeof (body === null || body === void 0 ? void 0 : body.writable) === "object" || typeof (body === null || body === void 0 ? void 0 : body.readable) === "object") return _duplexify({
			readable: body !== null && body !== void 0 && body.readable ? isReadableNodeStream(body === null || body === void 0 ? void 0 : body.readable) ? body === null || body === void 0 ? void 0 : body.readable : duplexify(body.readable) : void 0,
			writable: body !== null && body !== void 0 && body.writable ? isWritableNodeStream(body === null || body === void 0 ? void 0 : body.writable) ? body === null || body === void 0 ? void 0 : body.writable : duplexify(body.writable) : void 0
		});
		const then = body === null || body === void 0 ? void 0 : body.then;
		if (typeof then === "function") {
			let d;
			FunctionPrototypeCall(then, body, (val) => {
				if (val != null) d.push(val);
				d.push(null);
			}, (err) => {
				destroyer(d, err);
			});
			return d = new Duplexify({
				objectMode: true,
				writable: false,
				read() {}
			});
		}
		throw new ERR_INVALID_ARG_TYPE(name, [
			"Blob",
			"ReadableStream",
			"WritableStream",
			"Stream",
			"Iterable",
			"AsyncIterable",
			"Function",
			"{ readable, writable } pair",
			"Promise"
		], body);
	};
	function fromAsyncGen(fn) {
		let { promise, resolve } = createDeferredPromise();
		const ac = new AbortController();
		const signal = ac.signal;
		return {
			value: fn((async function* () {
				while (true) {
					const _promise = promise;
					promise = null;
					const { chunk, done, cb } = await _promise;
					process.nextTick(cb);
					if (done) return;
					if (signal.aborted) throw new AbortError(void 0, { cause: signal.reason });
					({promise, resolve} = createDeferredPromise());
					yield chunk;
				}
			})(), { signal }),
			write(chunk, encoding, cb) {
				const _resolve = resolve;
				resolve = null;
				_resolve({
					chunk,
					done: false,
					cb
				});
			},
			final(cb) {
				const _resolve = resolve;
				resolve = null;
				_resolve({
					done: true,
					cb
				});
			},
			destroy(err, cb) {
				ac.abort();
				cb(err);
			}
		};
	}
	function _duplexify(pair) {
		const r = pair.readable && typeof pair.readable.read !== "function" ? Readable.wrap(pair.readable) : pair.readable;
		const w = pair.writable;
		let readable = !!isReadable(r);
		let writable = !!isWritable(w);
		let ondrain;
		let onfinish;
		let onreadable;
		let onclose;
		let d;
		function onfinished(err) {
			const cb = onclose;
			onclose = null;
			if (cb) cb(err);
			else if (err) d.destroy(err);
		}
		d = new Duplexify({
			readableObjectMode: !!(r !== null && r !== void 0 && r.readableObjectMode),
			writableObjectMode: !!(w !== null && w !== void 0 && w.writableObjectMode),
			readable,
			writable
		});
		if (writable) {
			eos(w, (err) => {
				writable = false;
				if (err) destroyer(r, err);
				onfinished(err);
			});
			d._write = function(chunk, encoding, callback) {
				if (w.write(chunk, encoding)) callback();
				else ondrain = callback;
			};
			d._final = function(callback) {
				w.end();
				onfinish = callback;
			};
			w.on("drain", function() {
				if (ondrain) {
					const cb = ondrain;
					ondrain = null;
					cb();
				}
			});
			w.on("finish", function() {
				if (onfinish) {
					const cb = onfinish;
					onfinish = null;
					cb();
				}
			});
		}
		if (readable) {
			eos(r, (err) => {
				readable = false;
				if (err) destroyer(r, err);
				onfinished(err);
			});
			r.on("readable", function() {
				if (onreadable) {
					const cb = onreadable;
					onreadable = null;
					cb();
				}
			});
			r.on("end", function() {
				d.push(null);
			});
			d._read = function() {
				while (true) {
					const buf = r.read();
					if (buf === null) {
						onreadable = d._read;
						return;
					}
					if (!d.push(buf)) return;
				}
			};
		}
		d._destroy = function(err, callback) {
			if (!err && onclose !== null) err = new AbortError();
			onreadable = null;
			ondrain = null;
			onfinish = null;
			if (onclose === null) callback(err);
			else {
				onclose = callback;
				destroyer(w, err);
				destroyer(r, err);
			}
		};
		return d;
	}
}));
//#endregion
//#region ../../node_modules/.pnpm/readable-stream@4.8.0/node_modules/readable-stream/lib/internal/streams/duplex.js
var require_duplex = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { ObjectDefineProperties, ObjectGetOwnPropertyDescriptor, ObjectKeys, ObjectSetPrototypeOf } = require_primordials();
	module.exports = Duplex;
	const Readable = require_readable();
	const Writable = require_writable();
	ObjectSetPrototypeOf(Duplex.prototype, Readable.prototype);
	ObjectSetPrototypeOf(Duplex, Readable);
	{
		const keys = ObjectKeys(Writable.prototype);
		for (let i = 0; i < keys.length; i++) {
			const method = keys[i];
			if (!Duplex.prototype[method]) Duplex.prototype[method] = Writable.prototype[method];
		}
	}
	function Duplex(options) {
		if (!(this instanceof Duplex)) return new Duplex(options);
		Readable.call(this, options);
		Writable.call(this, options);
		if (options) {
			this.allowHalfOpen = options.allowHalfOpen !== false;
			if (options.readable === false) {
				this._readableState.readable = false;
				this._readableState.ended = true;
				this._readableState.endEmitted = true;
			}
			if (options.writable === false) {
				this._writableState.writable = false;
				this._writableState.ending = true;
				this._writableState.ended = true;
				this._writableState.finished = true;
			}
		} else this.allowHalfOpen = true;
	}
	ObjectDefineProperties(Duplex.prototype, {
		writable: {
			__proto__: null,
			...ObjectGetOwnPropertyDescriptor(Writable.prototype, "writable")
		},
		writableHighWaterMark: {
			__proto__: null,
			...ObjectGetOwnPropertyDescriptor(Writable.prototype, "writableHighWaterMark")
		},
		writableObjectMode: {
			__proto__: null,
			...ObjectGetOwnPropertyDescriptor(Writable.prototype, "writableObjectMode")
		},
		writableBuffer: {
			__proto__: null,
			...ObjectGetOwnPropertyDescriptor(Writable.prototype, "writableBuffer")
		},
		writableLength: {
			__proto__: null,
			...ObjectGetOwnPropertyDescriptor(Writable.prototype, "writableLength")
		},
		writableFinished: {
			__proto__: null,
			...ObjectGetOwnPropertyDescriptor(Writable.prototype, "writableFinished")
		},
		writableCorked: {
			__proto__: null,
			...ObjectGetOwnPropertyDescriptor(Writable.prototype, "writableCorked")
		},
		writableEnded: {
			__proto__: null,
			...ObjectGetOwnPropertyDescriptor(Writable.prototype, "writableEnded")
		},
		writableNeedDrain: {
			__proto__: null,
			...ObjectGetOwnPropertyDescriptor(Writable.prototype, "writableNeedDrain")
		},
		destroyed: {
			__proto__: null,
			get() {
				if (this._readableState === void 0 || this._writableState === void 0) return false;
				return this._readableState.destroyed && this._writableState.destroyed;
			},
			set(value) {
				if (this._readableState && this._writableState) {
					this._readableState.destroyed = value;
					this._writableState.destroyed = value;
				}
			}
		}
	});
	let webStreamsAdapters;
	function lazyWebStreams() {
		if (webStreamsAdapters === void 0) webStreamsAdapters = {};
		return webStreamsAdapters;
	}
	Duplex.fromWeb = function(pair, options) {
		return lazyWebStreams().newStreamDuplexFromReadableWritablePair(pair, options);
	};
	Duplex.toWeb = function(duplex) {
		return lazyWebStreams().newReadableWritablePairFromDuplex(duplex);
	};
	let duplexify;
	Duplex.from = function(body) {
		if (!duplexify) duplexify = require_duplexify();
		return duplexify(body, "body");
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/readable-stream@4.8.0/node_modules/readable-stream/lib/internal/streams/transform.js
var require_transform = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { ObjectSetPrototypeOf, Symbol } = require_primordials();
	module.exports = Transform;
	const { ERR_METHOD_NOT_IMPLEMENTED } = require_errors().codes;
	const Duplex = require_duplex();
	const { getHighWaterMark } = require_state();
	ObjectSetPrototypeOf(Transform.prototype, Duplex.prototype);
	ObjectSetPrototypeOf(Transform, Duplex);
	const kCallback = Symbol("kCallback");
	function Transform(options) {
		if (!(this instanceof Transform)) return new Transform(options);
		const readableHighWaterMark = options ? getHighWaterMark(this, options, "readableHighWaterMark", true) : null;
		if (readableHighWaterMark === 0) options = {
			...options,
			highWaterMark: null,
			readableHighWaterMark,
			writableHighWaterMark: options.writableHighWaterMark || 0
		};
		Duplex.call(this, options);
		this._readableState.sync = false;
		this[kCallback] = null;
		if (options) {
			if (typeof options.transform === "function") this._transform = options.transform;
			if (typeof options.flush === "function") this._flush = options.flush;
		}
		this.on("prefinish", prefinish);
	}
	function final(cb) {
		if (typeof this._flush === "function" && !this.destroyed) this._flush((er, data) => {
			if (er) {
				if (cb) cb(er);
				else this.destroy(er);
				return;
			}
			if (data != null) this.push(data);
			this.push(null);
			if (cb) cb();
		});
		else {
			this.push(null);
			if (cb) cb();
		}
	}
	function prefinish() {
		if (this._final !== final) final.call(this);
	}
	Transform.prototype._final = final;
	Transform.prototype._transform = function(chunk, encoding, callback) {
		throw new ERR_METHOD_NOT_IMPLEMENTED("_transform()");
	};
	Transform.prototype._write = function(chunk, encoding, callback) {
		const rState = this._readableState;
		const wState = this._writableState;
		const length = rState.length;
		this._transform(chunk, encoding, (err, val) => {
			if (err) {
				callback(err);
				return;
			}
			if (val != null) this.push(val);
			if (wState.ended || length === rState.length || rState.length < rState.highWaterMark) callback();
			else this[kCallback] = callback;
		});
	};
	Transform.prototype._read = function() {
		if (this[kCallback]) {
			const callback = this[kCallback];
			this[kCallback] = null;
			callback();
		}
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/readable-stream@4.8.0/node_modules/readable-stream/lib/internal/streams/passthrough.js
var require_passthrough = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { ObjectSetPrototypeOf } = require_primordials();
	module.exports = PassThrough;
	const Transform = require_transform();
	ObjectSetPrototypeOf(PassThrough.prototype, Transform.prototype);
	ObjectSetPrototypeOf(PassThrough, Transform);
	function PassThrough(options) {
		if (!(this instanceof PassThrough)) return new PassThrough(options);
		Transform.call(this, options);
	}
	PassThrough.prototype._transform = function(chunk, encoding, cb) {
		cb(null, chunk);
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/readable-stream@4.8.0/node_modules/readable-stream/lib/internal/streams/pipeline.js
var require_pipeline = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const process = require_process();
	const { ArrayIsArray, Promise, SymbolAsyncIterator, SymbolDispose } = require_primordials();
	const eos = require_end_of_stream();
	const { once } = require_util();
	const destroyImpl = require_destroy();
	const Duplex = require_duplex();
	const { aggregateTwoErrors, codes: { ERR_INVALID_ARG_TYPE, ERR_INVALID_RETURN_VALUE, ERR_MISSING_ARGS, ERR_STREAM_DESTROYED, ERR_STREAM_PREMATURE_CLOSE }, AbortError } = require_errors();
	const { validateFunction, validateAbortSignal } = require_validators();
	const { isIterable, isReadable, isReadableNodeStream, isNodeStream, isTransformStream, isWebStream, isReadableStream, isReadableFinished } = require_utils();
	const AbortController = globalThis.AbortController || require__empty_module().AbortController;
	let PassThrough;
	let Readable;
	let addAbortListener;
	function destroyer(stream, reading, writing) {
		let finished = false;
		stream.on("close", () => {
			finished = true;
		});
		return {
			destroy: (err) => {
				if (finished) return;
				finished = true;
				destroyImpl.destroyer(stream, err || new ERR_STREAM_DESTROYED("pipe"));
			},
			cleanup: eos(stream, {
				readable: reading,
				writable: writing
			}, (err) => {
				finished = !err;
			})
		};
	}
	function popCallback(streams) {
		validateFunction(streams[streams.length - 1], "streams[stream.length - 1]");
		return streams.pop();
	}
	function makeAsyncIterable(val) {
		if (isIterable(val)) return val;
		else if (isReadableNodeStream(val)) return fromReadable(val);
		throw new ERR_INVALID_ARG_TYPE("val", [
			"Readable",
			"Iterable",
			"AsyncIterable"
		], val);
	}
	async function* fromReadable(val) {
		if (!Readable) Readable = require_readable();
		yield* Readable.prototype[SymbolAsyncIterator].call(val);
	}
	async function pumpToNode(iterable, writable, finish, { end }) {
		let error;
		let onresolve = null;
		const resume = (err) => {
			if (err) error = err;
			if (onresolve) {
				const callback = onresolve;
				onresolve = null;
				callback();
			}
		};
		const wait = () => new Promise((resolve, reject) => {
			if (error) reject(error);
			else onresolve = () => {
				if (error) reject(error);
				else resolve();
			};
		});
		writable.on("drain", resume);
		const cleanup = eos(writable, { readable: false }, resume);
		try {
			if (writable.writableNeedDrain) await wait();
			for await (const chunk of iterable) if (!writable.write(chunk)) await wait();
			if (end) {
				writable.end();
				await wait();
			}
			finish();
		} catch (err) {
			finish(error !== err ? aggregateTwoErrors(error, err) : err);
		} finally {
			cleanup();
			writable.off("drain", resume);
		}
	}
	async function pumpToWeb(readable, writable, finish, { end }) {
		if (isTransformStream(writable)) writable = writable.writable;
		const writer = writable.getWriter();
		try {
			for await (const chunk of readable) {
				await writer.ready;
				writer.write(chunk).catch(() => {});
			}
			await writer.ready;
			if (end) await writer.close();
			finish();
		} catch (err) {
			try {
				await writer.abort(err);
				finish(err);
			} catch (err) {
				finish(err);
			}
		}
	}
	function pipeline(...streams) {
		return pipelineImpl(streams, once(popCallback(streams)));
	}
	function pipelineImpl(streams, callback, opts) {
		if (streams.length === 1 && ArrayIsArray(streams[0])) streams = streams[0];
		if (streams.length < 2) throw new ERR_MISSING_ARGS("streams");
		const ac = new AbortController();
		const signal = ac.signal;
		const outerSignal = opts === null || opts === void 0 ? void 0 : opts.signal;
		const lastStreamCleanup = [];
		validateAbortSignal(outerSignal, "options.signal");
		function abort() {
			finishImpl(new AbortError());
		}
		addAbortListener = addAbortListener || require_util().addAbortListener;
		let disposable;
		if (outerSignal) disposable = addAbortListener(outerSignal, abort);
		let error;
		let value;
		const destroys = [];
		let finishCount = 0;
		function finish(err) {
			finishImpl(err, --finishCount === 0);
		}
		function finishImpl(err, final) {
			var _disposable;
			if (err && (!error || error.code === "ERR_STREAM_PREMATURE_CLOSE")) error = err;
			if (!error && !final) return;
			while (destroys.length) destroys.shift()(error);
			(_disposable = disposable) === null || _disposable === void 0 || _disposable[SymbolDispose]();
			ac.abort();
			if (final) {
				if (!error) lastStreamCleanup.forEach((fn) => fn());
				process.nextTick(callback, error, value);
			}
		}
		let ret;
		for (let i = 0; i < streams.length; i++) {
			const stream = streams[i];
			const reading = i < streams.length - 1;
			const writing = i > 0;
			const end = reading || (opts === null || opts === void 0 ? void 0 : opts.end) !== false;
			const isLastStream = i === streams.length - 1;
			if (isNodeStream(stream)) {
				if (end) {
					const { destroy, cleanup } = destroyer(stream, reading, writing);
					destroys.push(destroy);
					if (isReadable(stream) && isLastStream) lastStreamCleanup.push(cleanup);
				}
				function onError(err) {
					if (err && err.name !== "AbortError" && err.code !== "ERR_STREAM_PREMATURE_CLOSE") finish(err);
				}
				stream.on("error", onError);
				if (isReadable(stream) && isLastStream) lastStreamCleanup.push(() => {
					stream.removeListener("error", onError);
				});
			}
			if (i === 0) {
				if (typeof stream === "function") {
					ret = stream({ signal });
					if (!isIterable(ret)) throw new ERR_INVALID_RETURN_VALUE("Iterable, AsyncIterable or Stream", "source", ret);
				} else if (isIterable(stream) || isReadableNodeStream(stream) || isTransformStream(stream)) ret = stream;
				else ret = Duplex.from(stream);
			} else if (typeof stream === "function") {
				if (isTransformStream(ret)) {
					var _ret;
					ret = makeAsyncIterable((_ret = ret) === null || _ret === void 0 ? void 0 : _ret.readable);
				} else ret = makeAsyncIterable(ret);
				ret = stream(ret, { signal });
				if (reading) {
					if (!isIterable(ret, true)) throw new ERR_INVALID_RETURN_VALUE("AsyncIterable", `transform[${i - 1}]`, ret);
				} else {
					var _ret2;
					if (!PassThrough) PassThrough = require_passthrough();
					const pt = new PassThrough({ objectMode: true });
					const then = (_ret2 = ret) === null || _ret2 === void 0 ? void 0 : _ret2.then;
					if (typeof then === "function") {
						finishCount++;
						then.call(ret, (val) => {
							value = val;
							if (val != null) pt.write(val);
							if (end) pt.end();
							process.nextTick(finish);
						}, (err) => {
							pt.destroy(err);
							process.nextTick(finish, err);
						});
					} else if (isIterable(ret, true)) {
						finishCount++;
						pumpToNode(ret, pt, finish, { end });
					} else if (isReadableStream(ret) || isTransformStream(ret)) {
						const toRead = ret.readable || ret;
						finishCount++;
						pumpToNode(toRead, pt, finish, { end });
					} else throw new ERR_INVALID_RETURN_VALUE("AsyncIterable or Promise", "destination", ret);
					ret = pt;
					const { destroy, cleanup } = destroyer(ret, false, true);
					destroys.push(destroy);
					if (isLastStream) lastStreamCleanup.push(cleanup);
				}
			} else if (isNodeStream(stream)) {
				if (isReadableNodeStream(ret)) {
					finishCount += 2;
					const cleanup = pipe(ret, stream, finish, { end });
					if (isReadable(stream) && isLastStream) lastStreamCleanup.push(cleanup);
				} else if (isTransformStream(ret) || isReadableStream(ret)) {
					const toRead = ret.readable || ret;
					finishCount++;
					pumpToNode(toRead, stream, finish, { end });
				} else if (isIterable(ret)) {
					finishCount++;
					pumpToNode(ret, stream, finish, { end });
				} else throw new ERR_INVALID_ARG_TYPE("val", [
					"Readable",
					"Iterable",
					"AsyncIterable",
					"ReadableStream",
					"TransformStream"
				], ret);
				ret = stream;
			} else if (isWebStream(stream)) {
				if (isReadableNodeStream(ret)) {
					finishCount++;
					pumpToWeb(makeAsyncIterable(ret), stream, finish, { end });
				} else if (isReadableStream(ret) || isIterable(ret)) {
					finishCount++;
					pumpToWeb(ret, stream, finish, { end });
				} else if (isTransformStream(ret)) {
					finishCount++;
					pumpToWeb(ret.readable, stream, finish, { end });
				} else throw new ERR_INVALID_ARG_TYPE("val", [
					"Readable",
					"Iterable",
					"AsyncIterable",
					"ReadableStream",
					"TransformStream"
				], ret);
				ret = stream;
			} else ret = Duplex.from(stream);
		}
		if (signal !== null && signal !== void 0 && signal.aborted || outerSignal !== null && outerSignal !== void 0 && outerSignal.aborted) process.nextTick(abort);
		return ret;
	}
	function pipe(src, dst, finish, { end }) {
		let ended = false;
		dst.on("close", () => {
			if (!ended) finish(new ERR_STREAM_PREMATURE_CLOSE());
		});
		src.pipe(dst, { end: false });
		if (end) {
			function endFn() {
				ended = true;
				dst.end();
			}
			if (isReadableFinished(src)) process.nextTick(endFn);
			else src.once("end", endFn);
		} else finish();
		eos(src, {
			readable: true,
			writable: false
		}, (err) => {
			const rState = src._readableState;
			if (err && err.code === "ERR_STREAM_PREMATURE_CLOSE" && rState && rState.ended && !rState.errored && !rState.errorEmitted) src.once("end", finish).once("error", finish);
			else finish(err);
		});
		return eos(dst, {
			readable: false,
			writable: true
		}, finish);
	}
	module.exports = {
		pipelineImpl,
		pipeline
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/readable-stream@4.8.0/node_modules/readable-stream/lib/internal/streams/compose.js
var require_compose = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { pipeline } = require_pipeline();
	const Duplex = require_duplex();
	const { destroyer } = require_destroy();
	const { isNodeStream, isReadable, isWritable, isWebStream, isTransformStream, isWritableStream, isReadableStream } = require_utils();
	const { AbortError, codes: { ERR_INVALID_ARG_VALUE, ERR_MISSING_ARGS } } = require_errors();
	const eos = require_end_of_stream();
	module.exports = function compose(...streams) {
		if (streams.length === 0) throw new ERR_MISSING_ARGS("streams");
		if (streams.length === 1) return Duplex.from(streams[0]);
		const orgStreams = [...streams];
		if (typeof streams[0] === "function") streams[0] = Duplex.from(streams[0]);
		if (typeof streams[streams.length - 1] === "function") {
			const idx = streams.length - 1;
			streams[idx] = Duplex.from(streams[idx]);
		}
		for (let n = 0; n < streams.length; ++n) {
			if (!isNodeStream(streams[n]) && !isWebStream(streams[n])) continue;
			if (n < streams.length - 1 && !(isReadable(streams[n]) || isReadableStream(streams[n]) || isTransformStream(streams[n]))) throw new ERR_INVALID_ARG_VALUE(`streams[${n}]`, orgStreams[n], "must be readable");
			if (n > 0 && !(isWritable(streams[n]) || isWritableStream(streams[n]) || isTransformStream(streams[n]))) throw new ERR_INVALID_ARG_VALUE(`streams[${n}]`, orgStreams[n], "must be writable");
		}
		let ondrain;
		let onfinish;
		let onreadable;
		let onclose;
		let d;
		function onfinished(err) {
			const cb = onclose;
			onclose = null;
			if (cb) cb(err);
			else if (err) d.destroy(err);
			else if (!readable && !writable) d.destroy();
		}
		const head = streams[0];
		const tail = pipeline(streams, onfinished);
		const writable = !!(isWritable(head) || isWritableStream(head) || isTransformStream(head));
		const readable = !!(isReadable(tail) || isReadableStream(tail) || isTransformStream(tail));
		d = new Duplex({
			writableObjectMode: !!(head !== null && head !== void 0 && head.writableObjectMode),
			readableObjectMode: !!(tail !== null && tail !== void 0 && tail.readableObjectMode),
			writable,
			readable
		});
		if (writable) {
			if (isNodeStream(head)) {
				d._write = function(chunk, encoding, callback) {
					if (head.write(chunk, encoding)) callback();
					else ondrain = callback;
				};
				d._final = function(callback) {
					head.end();
					onfinish = callback;
				};
				head.on("drain", function() {
					if (ondrain) {
						const cb = ondrain;
						ondrain = null;
						cb();
					}
				});
			} else if (isWebStream(head)) {
				const writer = (isTransformStream(head) ? head.writable : head).getWriter();
				d._write = async function(chunk, encoding, callback) {
					try {
						await writer.ready;
						writer.write(chunk).catch(() => {});
						callback();
					} catch (err) {
						callback(err);
					}
				};
				d._final = async function(callback) {
					try {
						await writer.ready;
						writer.close().catch(() => {});
						onfinish = callback;
					} catch (err) {
						callback(err);
					}
				};
			}
			const toRead = isTransformStream(tail) ? tail.readable : tail;
			eos(toRead, () => {
				if (onfinish) {
					const cb = onfinish;
					onfinish = null;
					cb();
				}
			});
		}
		if (readable) {
			if (isNodeStream(tail)) {
				tail.on("readable", function() {
					if (onreadable) {
						const cb = onreadable;
						onreadable = null;
						cb();
					}
				});
				tail.on("end", function() {
					d.push(null);
				});
				d._read = function() {
					while (true) {
						const buf = tail.read();
						if (buf === null) {
							onreadable = d._read;
							return;
						}
						if (!d.push(buf)) return;
					}
				};
			} else if (isWebStream(tail)) {
				const reader = (isTransformStream(tail) ? tail.readable : tail).getReader();
				d._read = async function() {
					while (true) try {
						const { value, done } = await reader.read();
						if (!d.push(value)) return;
						if (done) {
							d.push(null);
							return;
						}
					} catch {
						return;
					}
				};
			}
		}
		d._destroy = function(err, callback) {
			if (!err && onclose !== null) err = new AbortError();
			onreadable = null;
			ondrain = null;
			onfinish = null;
			if (onclose === null) callback(err);
			else {
				onclose = callback;
				if (isNodeStream(tail)) destroyer(tail, err);
			}
		};
		return d;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/readable-stream@4.8.0/node_modules/readable-stream/lib/internal/streams/operators.js
var require_operators = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const AbortController = globalThis.AbortController || require__empty_module().AbortController;
	const { codes: { ERR_INVALID_ARG_VALUE, ERR_INVALID_ARG_TYPE, ERR_MISSING_ARGS, ERR_OUT_OF_RANGE }, AbortError } = require_errors();
	const { validateAbortSignal, validateInteger, validateObject } = require_validators();
	const kWeakHandler = require_primordials().Symbol("kWeak");
	const kResistStopPropagation = require_primordials().Symbol("kResistStopPropagation");
	const { finished } = require_end_of_stream();
	const staticCompose = require_compose();
	const { addAbortSignalNoValidate } = require_add_abort_signal();
	const { isWritable, isNodeStream } = require_utils();
	const { deprecate } = require_util();
	const { ArrayPrototypePush, Boolean, MathFloor, Number, NumberIsNaN, Promise, PromiseReject, PromiseResolve, PromisePrototypeThen, Symbol } = require_primordials();
	const kEmpty = Symbol("kEmpty");
	const kEof = Symbol("kEof");
	function compose(stream, options) {
		if (options != null) validateObject(options, "options");
		if ((options === null || options === void 0 ? void 0 : options.signal) != null) validateAbortSignal(options.signal, "options.signal");
		if (isNodeStream(stream) && !isWritable(stream)) throw new ERR_INVALID_ARG_VALUE("stream", stream, "must be writable");
		const composedStream = staticCompose(this, stream);
		if (options !== null && options !== void 0 && options.signal) addAbortSignalNoValidate(options.signal, composedStream);
		return composedStream;
	}
	function map(fn, options) {
		if (typeof fn !== "function") throw new ERR_INVALID_ARG_TYPE("fn", ["Function", "AsyncFunction"], fn);
		if (options != null) validateObject(options, "options");
		if ((options === null || options === void 0 ? void 0 : options.signal) != null) validateAbortSignal(options.signal, "options.signal");
		let concurrency = 1;
		if ((options === null || options === void 0 ? void 0 : options.concurrency) != null) concurrency = MathFloor(options.concurrency);
		let highWaterMark = concurrency - 1;
		if ((options === null || options === void 0 ? void 0 : options.highWaterMark) != null) highWaterMark = MathFloor(options.highWaterMark);
		validateInteger(concurrency, "options.concurrency", 1);
		validateInteger(highWaterMark, "options.highWaterMark", 0);
		highWaterMark += concurrency;
		return async function* map() {
			const signal = require_util().AbortSignalAny([options === null || options === void 0 ? void 0 : options.signal].filter(Boolean));
			const stream = this;
			const queue = [];
			const signalOpt = { signal };
			let next;
			let resume;
			let done = false;
			let cnt = 0;
			function onCatch() {
				done = true;
				afterItemProcessed();
			}
			function afterItemProcessed() {
				cnt -= 1;
				maybeResume();
			}
			function maybeResume() {
				if (resume && !done && cnt < concurrency && queue.length < highWaterMark) {
					resume();
					resume = null;
				}
			}
			async function pump() {
				try {
					for await (let val of stream) {
						if (done) return;
						if (signal.aborted) throw new AbortError();
						try {
							val = fn(val, signalOpt);
							if (val === kEmpty) continue;
							val = PromiseResolve(val);
						} catch (err) {
							val = PromiseReject(err);
						}
						cnt += 1;
						PromisePrototypeThen(val, afterItemProcessed, onCatch);
						queue.push(val);
						if (next) {
							next();
							next = null;
						}
						if (!done && (queue.length >= highWaterMark || cnt >= concurrency)) await new Promise((resolve) => {
							resume = resolve;
						});
					}
					queue.push(kEof);
				} catch (err) {
					const val = PromiseReject(err);
					PromisePrototypeThen(val, afterItemProcessed, onCatch);
					queue.push(val);
				} finally {
					done = true;
					if (next) {
						next();
						next = null;
					}
				}
			}
			pump();
			try {
				while (true) {
					while (queue.length > 0) {
						const val = await queue[0];
						if (val === kEof) return;
						if (signal.aborted) throw new AbortError();
						if (val !== kEmpty) yield val;
						queue.shift();
						maybeResume();
					}
					await new Promise((resolve) => {
						next = resolve;
					});
				}
			} finally {
				done = true;
				if (resume) {
					resume();
					resume = null;
				}
			}
		}.call(this);
	}
	function asIndexedPairs(options = void 0) {
		if (options != null) validateObject(options, "options");
		if ((options === null || options === void 0 ? void 0 : options.signal) != null) validateAbortSignal(options.signal, "options.signal");
		return async function* asIndexedPairs() {
			let index = 0;
			for await (const val of this) {
				var _options$signal;
				if (options !== null && options !== void 0 && (_options$signal = options.signal) !== null && _options$signal !== void 0 && _options$signal.aborted) throw new AbortError({ cause: options.signal.reason });
				yield [index++, val];
			}
		}.call(this);
	}
	async function some(fn, options = void 0) {
		for await (const unused of filter.call(this, fn, options)) return true;
		return false;
	}
	async function every(fn, options = void 0) {
		if (typeof fn !== "function") throw new ERR_INVALID_ARG_TYPE("fn", ["Function", "AsyncFunction"], fn);
		return !await some.call(this, async (...args) => {
			return !await fn(...args);
		}, options);
	}
	async function find(fn, options) {
		for await (const result of filter.call(this, fn, options)) return result;
	}
	async function forEach(fn, options) {
		if (typeof fn !== "function") throw new ERR_INVALID_ARG_TYPE("fn", ["Function", "AsyncFunction"], fn);
		async function forEachFn(value, options) {
			await fn(value, options);
			return kEmpty;
		}
		for await (const unused of map.call(this, forEachFn, options));
	}
	function filter(fn, options) {
		if (typeof fn !== "function") throw new ERR_INVALID_ARG_TYPE("fn", ["Function", "AsyncFunction"], fn);
		async function filterFn(value, options) {
			if (await fn(value, options)) return value;
			return kEmpty;
		}
		return map.call(this, filterFn, options);
	}
	var ReduceAwareErrMissingArgs = class extends ERR_MISSING_ARGS {
		constructor() {
			super("reduce");
			this.message = "Reduce of an empty stream requires an initial value";
		}
	};
	async function reduce(reducer, initialValue, options) {
		var _options$signal2;
		if (typeof reducer !== "function") throw new ERR_INVALID_ARG_TYPE("reducer", ["Function", "AsyncFunction"], reducer);
		if (options != null) validateObject(options, "options");
		if ((options === null || options === void 0 ? void 0 : options.signal) != null) validateAbortSignal(options.signal, "options.signal");
		let hasInitialValue = arguments.length > 1;
		if (options !== null && options !== void 0 && (_options$signal2 = options.signal) !== null && _options$signal2 !== void 0 && _options$signal2.aborted) {
			const err = new AbortError(void 0, { cause: options.signal.reason });
			this.once("error", () => {});
			await finished(this.destroy(err));
			throw err;
		}
		const ac = new AbortController();
		const signal = ac.signal;
		if (options !== null && options !== void 0 && options.signal) {
			const opts = {
				once: true,
				[kWeakHandler]: this,
				[kResistStopPropagation]: true
			};
			options.signal.addEventListener("abort", () => ac.abort(), opts);
		}
		let gotAnyItemFromStream = false;
		try {
			for await (const value of this) {
				var _options$signal3;
				gotAnyItemFromStream = true;
				if (options !== null && options !== void 0 && (_options$signal3 = options.signal) !== null && _options$signal3 !== void 0 && _options$signal3.aborted) throw new AbortError();
				if (!hasInitialValue) {
					initialValue = value;
					hasInitialValue = true;
				} else initialValue = await reducer(initialValue, value, { signal });
			}
			if (!gotAnyItemFromStream && !hasInitialValue) throw new ReduceAwareErrMissingArgs();
		} finally {
			ac.abort();
		}
		return initialValue;
	}
	async function toArray(options) {
		if (options != null) validateObject(options, "options");
		if ((options === null || options === void 0 ? void 0 : options.signal) != null) validateAbortSignal(options.signal, "options.signal");
		const result = [];
		for await (const val of this) {
			var _options$signal4;
			if (options !== null && options !== void 0 && (_options$signal4 = options.signal) !== null && _options$signal4 !== void 0 && _options$signal4.aborted) throw new AbortError(void 0, { cause: options.signal.reason });
			ArrayPrototypePush(result, val);
		}
		return result;
	}
	function flatMap(fn, options) {
		const values = map.call(this, fn, options);
		return async function* flatMap() {
			for await (const val of values) yield* val;
		}.call(this);
	}
	function toIntegerOrInfinity(number) {
		number = Number(number);
		if (NumberIsNaN(number)) return 0;
		if (number < 0) throw new ERR_OUT_OF_RANGE("number", ">= 0", number);
		return number;
	}
	function drop(number, options = void 0) {
		if (options != null) validateObject(options, "options");
		if ((options === null || options === void 0 ? void 0 : options.signal) != null) validateAbortSignal(options.signal, "options.signal");
		number = toIntegerOrInfinity(number);
		return async function* drop() {
			var _options$signal5;
			if (options !== null && options !== void 0 && (_options$signal5 = options.signal) !== null && _options$signal5 !== void 0 && _options$signal5.aborted) throw new AbortError();
			for await (const val of this) {
				var _options$signal6;
				if (options !== null && options !== void 0 && (_options$signal6 = options.signal) !== null && _options$signal6 !== void 0 && _options$signal6.aborted) throw new AbortError();
				if (number-- <= 0) yield val;
			}
		}.call(this);
	}
	function take(number, options = void 0) {
		if (options != null) validateObject(options, "options");
		if ((options === null || options === void 0 ? void 0 : options.signal) != null) validateAbortSignal(options.signal, "options.signal");
		number = toIntegerOrInfinity(number);
		return async function* take() {
			var _options$signal7;
			if (options !== null && options !== void 0 && (_options$signal7 = options.signal) !== null && _options$signal7 !== void 0 && _options$signal7.aborted) throw new AbortError();
			for await (const val of this) {
				var _options$signal8;
				if (options !== null && options !== void 0 && (_options$signal8 = options.signal) !== null && _options$signal8 !== void 0 && _options$signal8.aborted) throw new AbortError();
				if (number-- > 0) yield val;
				if (number <= 0) return;
			}
		}.call(this);
	}
	module.exports.streamReturningOperators = {
		asIndexedPairs: deprecate(asIndexedPairs, "readable.asIndexedPairs will be removed in a future version."),
		drop,
		filter,
		flatMap,
		map,
		take,
		compose
	};
	module.exports.promiseReturningOperators = {
		every,
		forEach,
		reduce,
		toArray,
		some,
		find
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/readable-stream@4.8.0/node_modules/readable-stream/lib/stream/promises.js
var require_promises = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { ArrayPrototypePop, Promise } = require_primordials();
	const { isIterable, isNodeStream, isWebStream } = require_utils();
	const { pipelineImpl: pl } = require_pipeline();
	const { finished } = require_end_of_stream();
	require_stream();
	function pipeline(...streams) {
		return new Promise((resolve, reject) => {
			let signal;
			let end;
			const lastArg = streams[streams.length - 1];
			if (lastArg && typeof lastArg === "object" && !isNodeStream(lastArg) && !isIterable(lastArg) && !isWebStream(lastArg)) {
				const options = ArrayPrototypePop(streams);
				signal = options.signal;
				end = options.end;
			}
			pl(streams, (err, value) => {
				if (err) reject(err);
				else resolve(value);
			}, {
				signal,
				end
			});
		});
	}
	module.exports = {
		finished,
		pipeline
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/readable-stream@4.8.0/node_modules/readable-stream/lib/stream.js
var require_stream = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { Buffer } = require__require_as_import_buffer();
	const { ObjectDefineProperty, ObjectKeys, ReflectApply } = require_primordials();
	const { promisify: { custom: customPromisify } } = require_util();
	const { streamReturningOperators, promiseReturningOperators } = require_operators();
	const { codes: { ERR_ILLEGAL_CONSTRUCTOR } } = require_errors();
	const compose = require_compose();
	const { setDefaultHighWaterMark, getDefaultHighWaterMark } = require_state();
	const { pipeline } = require_pipeline();
	const { destroyer } = require_destroy();
	const eos = require_end_of_stream();
	const promises = require_promises();
	const utils = require_utils();
	const Stream = module.exports = require_legacy().Stream;
	Stream.isDestroyed = utils.isDestroyed;
	Stream.isDisturbed = utils.isDisturbed;
	Stream.isErrored = utils.isErrored;
	Stream.isReadable = utils.isReadable;
	Stream.isWritable = utils.isWritable;
	Stream.Readable = require_readable();
	for (const key of ObjectKeys(streamReturningOperators)) {
		const op = streamReturningOperators[key];
		function fn(...args) {
			if (new.target) throw ERR_ILLEGAL_CONSTRUCTOR();
			return Stream.Readable.from(ReflectApply(op, this, args));
		}
		ObjectDefineProperty(fn, "name", {
			__proto__: null,
			value: op.name
		});
		ObjectDefineProperty(fn, "length", {
			__proto__: null,
			value: op.length
		});
		ObjectDefineProperty(Stream.Readable.prototype, key, {
			__proto__: null,
			value: fn,
			enumerable: false,
			configurable: true,
			writable: true
		});
	}
	for (const key of ObjectKeys(promiseReturningOperators)) {
		const op = promiseReturningOperators[key];
		function fn(...args) {
			if (new.target) throw ERR_ILLEGAL_CONSTRUCTOR();
			return ReflectApply(op, this, args);
		}
		ObjectDefineProperty(fn, "name", {
			__proto__: null,
			value: op.name
		});
		ObjectDefineProperty(fn, "length", {
			__proto__: null,
			value: op.length
		});
		ObjectDefineProperty(Stream.Readable.prototype, key, {
			__proto__: null,
			value: fn,
			enumerable: false,
			configurable: true,
			writable: true
		});
	}
	Stream.Writable = require_writable();
	Stream.Duplex = require_duplex();
	Stream.Transform = require_transform();
	Stream.PassThrough = require_passthrough();
	Stream.pipeline = pipeline;
	const { addAbortSignal } = require_add_abort_signal();
	Stream.addAbortSignal = addAbortSignal;
	Stream.finished = eos;
	Stream.destroy = destroyer;
	Stream.compose = compose;
	Stream.setDefaultHighWaterMark = setDefaultHighWaterMark;
	Stream.getDefaultHighWaterMark = getDefaultHighWaterMark;
	ObjectDefineProperty(Stream, "promises", {
		__proto__: null,
		configurable: true,
		enumerable: true,
		get() {
			return promises;
		}
	});
	ObjectDefineProperty(pipeline, customPromisify, {
		__proto__: null,
		enumerable: true,
		get() {
			return promises.pipeline;
		}
	});
	ObjectDefineProperty(eos, customPromisify, {
		__proto__: null,
		enumerable: true,
		get() {
			return promises.finished;
		}
	});
	Stream.Stream = Stream;
	Stream._isUint8Array = function isUint8Array(value) {
		return value instanceof Uint8Array;
	};
	Stream._uint8ArrayToBuffer = function _uint8ArrayToBuffer(chunk) {
		return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
	};
}));
//#endregion
//#region src/node/stream.ts
var import_browser = (/* @__PURE__ */ __commonJSMin(((exports, module) => {
	const CustomStream = require_stream();
	const promises = require_promises();
	const originalDestroy = CustomStream.Readable.destroy;
	module.exports = CustomStream.Readable;
	module.exports._uint8ArrayToBuffer = CustomStream._uint8ArrayToBuffer;
	module.exports._isUint8Array = CustomStream._isUint8Array;
	module.exports.isDisturbed = CustomStream.isDisturbed;
	module.exports.isErrored = CustomStream.isErrored;
	module.exports.isReadable = CustomStream.isReadable;
	module.exports.Readable = CustomStream.Readable;
	module.exports.Writable = CustomStream.Writable;
	module.exports.Duplex = CustomStream.Duplex;
	module.exports.Transform = CustomStream.Transform;
	module.exports.PassThrough = CustomStream.PassThrough;
	module.exports.addAbortSignal = CustomStream.addAbortSignal;
	module.exports.finished = CustomStream.finished;
	module.exports.destroy = CustomStream.destroy;
	module.exports.destroy = originalDestroy;
	module.exports.pipeline = CustomStream.pipeline;
	module.exports.compose = CustomStream.compose;
	Object.defineProperty(CustomStream, "promises", {
		configurable: true,
		enumerable: true,
		get() {
			return promises;
		}
	});
	module.exports.Stream = CustomStream.Stream;
	module.exports.default = module.exports;
})))();
const { Readable, Writable, Duplex, Transform, PassThrough, finished, pipeline, promises, addAbortSignal, compose, destroy, isDisturbed, isErrored, isReadable, isWritable, isDestroyed, getDefaultHighWaterMark, setDefaultHighWaterMark, _isUint8Array, _uint8ArrayToBuffer } = import_browser.Stream;
const readable = Readable;
readable.toWeb = (source) => new ReadableStream({
	start(controller) {
		source.on("data", (chunk) => controller.enqueue(typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk)));
		source.on("end", () => controller.close());
		source.on("error", (error) => controller.error(error));
	},
	cancel: (reason) => void source.destroy(reason)
});
readable.fromWeb = (web) => {
	const reader = web.getReader();
	return new Readable({ read() {
		reader.read().then(({ done, value }) => void this.push(done ? null : Buffer.from(value)), (error) => this.destroy(error));
	} });
};
const missing = (name) => function() {
	throw new Error(`vitest-plugin-rsc: stream.${name} of Node.js is not there in the browser`);
};
const duplexPair = missing("duplexPair");
const _isArrayBufferView = (value) => ArrayBuffer.isView(value);
for (const kind of [Writable, Duplex]) {
	kind.toWeb = missing(`${kind.name}.toWeb`);
	kind.fromWeb = missing(`${kind.name}.fromWeb`);
}
var stream_default = import_browser.Stream;
//#endregion
var Stream = import_browser.Stream;
export { Duplex, PassThrough, Readable, Stream, Transform, Writable, _isArrayBufferView, _isUint8Array, _uint8ArrayToBuffer, addAbortSignal, compose, stream_default as default, destroy, duplexPair, finished, getDefaultHighWaterMark, isDestroyed, isDisturbed, isErrored, isReadable, isWritable, pipeline, promises, setDefaultHighWaterMark };
