//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
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
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/util/types.mjs
var types_exports = /* @__PURE__ */ __exportAll({
	isAnyArrayBuffer: () => isAnyArrayBuffer$1,
	isArgumentsObject: () => isArgumentsObject$1,
	isArrayBuffer: () => isArrayBuffer$1,
	isArrayBufferView: () => isArrayBufferView$1,
	isAsyncFunction: () => isAsyncFunction$1,
	isBigInt64Array: () => isBigInt64Array$1,
	isBigIntObject: () => isBigIntObject$1,
	isBigUint64Array: () => isBigUint64Array$1,
	isBooleanObject: () => isBooleanObject$1,
	isBoxedPrimitive: () => isBoxedPrimitive$1,
	isCryptoKey: () => isCryptoKey$1,
	isDataView: () => isDataView$1,
	isDate: () => isDate$1,
	isExternal: () => isExternal$1,
	isFloat32Array: () => isFloat32Array$1,
	isFloat64Array: () => isFloat64Array$1,
	isGeneratorFunction: () => isGeneratorFunction$1,
	isGeneratorObject: () => isGeneratorObject$1,
	isInt16Array: () => isInt16Array$1,
	isInt32Array: () => isInt32Array$1,
	isInt8Array: () => isInt8Array$1,
	isKeyObject: () => isKeyObject$1,
	isMap: () => isMap$1,
	isMapIterator: () => isMapIterator$1,
	isModuleNamespaceObject: () => isModuleNamespaceObject$1,
	isNativeError: () => isNativeError$1,
	isNumberObject: () => isNumberObject$1,
	isPromise: () => isPromise$1,
	isProxy: () => isProxy$1,
	isRegExp: () => isRegExp$1,
	isSet: () => isSet$1,
	isSetIterator: () => isSetIterator$1,
	isSharedArrayBuffer: () => isSharedArrayBuffer$1,
	isStringObject: () => isStringObject$1,
	isSymbolObject: () => isSymbolObject$1,
	isTypedArray: () => isTypedArray$1,
	isUint16Array: () => isUint16Array$1,
	isUint32Array: () => isUint32Array$1,
	isUint8Array: () => isUint8Array$1,
	isUint8ClampedArray: () => isUint8ClampedArray$1,
	isWeakMap: () => isWeakMap$1,
	isWeakSet: () => isWeakSet$1
});
const isExternal$1 = (_obj) => false;
const isDate$1 = (val) => val instanceof Date;
const isArgumentsObject$1 = /* @__PURE__ */ notImplemented("util.types.isArgumentsObject");
const isBigIntObject$1 = (val) => typeof val === "bigint";
const isBooleanObject$1 = (val) => typeof val === "boolean";
const isNumberObject$1 = (val) => typeof val === "number";
const isStringObject$1 = (val) => typeof val === "string";
const isSymbolObject$1 = (val) => typeof val === "symbol";
const isNativeError$1 = /* @__PURE__ */ notImplemented("util.types.isNativeError");
const isRegExp$1 = (val) => val instanceof RegExp;
const isAsyncFunction$1 = /* @__PURE__ */ notImplemented("util.types.isAsyncFunction");
const isGeneratorFunction$1 = /* @__PURE__ */ notImplemented("util.types.isGeneratorFunction");
const isGeneratorObject$1 = /* @__PURE__ */ notImplemented("util.types.isGeneratorObject");
const isPromise$1 = (val) => val instanceof Promise;
const isMap$1 = (val) => val instanceof Map;
const isSet$1 = (val) => val instanceof Set;
const isMapIterator$1 = /* @__PURE__ */ notImplemented("util.types.isMapIterator");
const isSetIterator$1 = /* @__PURE__ */ notImplemented("util.types.isSetIterator");
const isWeakMap$1 = (val) => val instanceof WeakMap;
const isWeakSet$1 = (val) => val instanceof WeakSet;
const isArrayBuffer$1 = (val) => val instanceof ArrayBuffer;
const isDataView$1 = (val) => val instanceof DataView;
const isSharedArrayBuffer$1 = (val) => val instanceof SharedArrayBuffer;
const isProxy$1 = /* @__PURE__ */ notImplemented("util.types.isProxy");
const isModuleNamespaceObject$1 = /* @__PURE__ */ notImplemented("util.types.isModuleNamespaceObject");
const isAnyArrayBuffer$1 = /* @__PURE__ */ notImplemented("util.types.isAnyArrayBuffer");
const isBoxedPrimitive$1 = /* @__PURE__ */ notImplemented("util.types.isBoxedPrimitive");
const isArrayBufferView$1 = /* @__PURE__ */ notImplemented("util.types.isArrayBufferView");
const isTypedArray$1 = /* @__PURE__ */ notImplemented("util.types.isTypedArray");
const isUint8Array$1 = /* @__PURE__ */ notImplemented("util.types.isUint8Array");
const isUint8ClampedArray$1 = /* @__PURE__ */ notImplemented("util.types.isUint8ClampedArray");
const isUint16Array$1 = /* @__PURE__ */ notImplemented("util.types.isUint16Array");
const isUint32Array$1 = /* @__PURE__ */ notImplemented("util.types.isUint32Array");
const isInt8Array$1 = /* @__PURE__ */ notImplemented("util.types.isInt8Array");
const isInt16Array$1 = /* @__PURE__ */ notImplemented("util.types.isInt16Array");
const isInt32Array$1 = /* @__PURE__ */ notImplemented("util.types.isInt32Array");
const isFloat32Array$1 = /* @__PURE__ */ notImplemented("util.types.isFloat32Array");
const isFloat64Array$1 = /* @__PURE__ */ notImplemented("util.types.isFloat64Array");
const isBigInt64Array$1 = /* @__PURE__ */ notImplemented("util.types.isBigInt64Array");
const isBigUint64Array$1 = /* @__PURE__ */ notImplemented("util.types.isBigUint64Array");
const isKeyObject$1 = /* @__PURE__ */ notImplemented("util.types.isKeyObject");
const isCryptoKey$1 = /* @__PURE__ */ notImplemented("util.types.isCryptoKey");
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/util/types.mjs
var types_default = types_exports;
//#endregion
//#region ../../node_modules/.pnpm/has-symbols@1.1.0/node_modules/has-symbols/shams.js
var require_shams$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = function hasSymbols() {
		if (typeof Symbol !== "function" || typeof Object.getOwnPropertySymbols !== "function") return false;
		if (typeof Symbol.iterator === "symbol") return true;
		var obj = {};
		var sym = Symbol("test");
		var symObj = Object(sym);
		if (typeof sym === "string") return false;
		if (Object.prototype.toString.call(sym) !== "[object Symbol]") return false;
		if (Object.prototype.toString.call(symObj) !== "[object Symbol]") return false;
		var symVal = 42;
		obj[sym] = symVal;
		for (var _ in obj) return false;
		if (typeof Object.keys === "function" && Object.keys(obj).length !== 0) return false;
		if (typeof Object.getOwnPropertyNames === "function" && Object.getOwnPropertyNames(obj).length !== 0) return false;
		var syms = Object.getOwnPropertySymbols(obj);
		if (syms.length !== 1 || syms[0] !== sym) return false;
		if (!Object.prototype.propertyIsEnumerable.call(obj, sym)) return false;
		if (typeof Object.getOwnPropertyDescriptor === "function") {
			var descriptor = Object.getOwnPropertyDescriptor(obj, sym);
			if (descriptor.value !== symVal || descriptor.enumerable !== true) return false;
		}
		return true;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/has-tostringtag@1.0.2/node_modules/has-tostringtag/shams.js
var require_shams = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var hasSymbols = require_shams$1();
	module.exports = function hasToStringTagShams() {
		return hasSymbols() && !!Symbol.toStringTag;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/es-object-atoms@1.1.1/node_modules/es-object-atoms/index.js
var require_es_object_atoms = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = Object;
}));
//#endregion
//#region ../../node_modules/.pnpm/es-errors@1.3.0/node_modules/es-errors/index.js
var require_es_errors = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = Error;
}));
//#endregion
//#region ../../node_modules/.pnpm/es-errors@1.3.0/node_modules/es-errors/eval.js
var require_eval = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = EvalError;
}));
//#endregion
//#region ../../node_modules/.pnpm/es-errors@1.3.0/node_modules/es-errors/range.js
var require_range = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = RangeError;
}));
//#endregion
//#region ../../node_modules/.pnpm/es-errors@1.3.0/node_modules/es-errors/ref.js
var require_ref = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = ReferenceError;
}));
//#endregion
//#region ../../node_modules/.pnpm/es-errors@1.3.0/node_modules/es-errors/syntax.js
var require_syntax = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = SyntaxError;
}));
//#endregion
//#region ../../node_modules/.pnpm/es-errors@1.3.0/node_modules/es-errors/type.js
var require_type = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = TypeError;
}));
//#endregion
//#region ../../node_modules/.pnpm/es-errors@1.3.0/node_modules/es-errors/uri.js
var require_uri = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = URIError;
}));
//#endregion
//#region ../../node_modules/.pnpm/math-intrinsics@1.1.0/node_modules/math-intrinsics/abs.js
var require_abs = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = Math.abs;
}));
//#endregion
//#region ../../node_modules/.pnpm/math-intrinsics@1.1.0/node_modules/math-intrinsics/floor.js
var require_floor = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = Math.floor;
}));
//#endregion
//#region ../../node_modules/.pnpm/math-intrinsics@1.1.0/node_modules/math-intrinsics/max.js
var require_max = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = Math.max;
}));
//#endregion
//#region ../../node_modules/.pnpm/math-intrinsics@1.1.0/node_modules/math-intrinsics/min.js
var require_min = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = Math.min;
}));
//#endregion
//#region ../../node_modules/.pnpm/math-intrinsics@1.1.0/node_modules/math-intrinsics/pow.js
var require_pow = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = Math.pow;
}));
//#endregion
//#region ../../node_modules/.pnpm/math-intrinsics@1.1.0/node_modules/math-intrinsics/round.js
var require_round = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = Math.round;
}));
//#endregion
//#region ../../node_modules/.pnpm/math-intrinsics@1.1.0/node_modules/math-intrinsics/isNaN.js
var require_isNaN = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = Number.isNaN || function isNaN(a) {
		return a !== a;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/math-intrinsics@1.1.0/node_modules/math-intrinsics/sign.js
var require_sign = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var $isNaN = require_isNaN();
	module.exports = function sign(number) {
		if ($isNaN(number) || number === 0) return number;
		return number < 0 ? -1 : 1;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/gopd@1.2.0/node_modules/gopd/gOPD.js
var require_gOPD = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = Object.getOwnPropertyDescriptor;
}));
//#endregion
//#region ../../node_modules/.pnpm/gopd@1.2.0/node_modules/gopd/index.js
var require_gopd = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var $gOPD = require_gOPD();
	if ($gOPD) try {
		$gOPD([], "length");
	} catch (e) {
		$gOPD = null;
	}
	module.exports = $gOPD;
}));
//#endregion
//#region ../../node_modules/.pnpm/es-define-property@1.0.1/node_modules/es-define-property/index.js
var require_es_define_property = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var $defineProperty = Object.defineProperty || false;
	if ($defineProperty) try {
		$defineProperty({}, "a", { value: 1 });
	} catch (e) {
		$defineProperty = false;
	}
	module.exports = $defineProperty;
}));
//#endregion
//#region ../../node_modules/.pnpm/has-symbols@1.1.0/node_modules/has-symbols/index.js
var require_has_symbols = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var origSymbol = typeof Symbol !== "undefined" && Symbol;
	var hasSymbolSham = require_shams$1();
	module.exports = function hasNativeSymbols() {
		if (typeof origSymbol !== "function") return false;
		if (typeof Symbol !== "function") return false;
		if (typeof origSymbol("foo") !== "symbol") return false;
		if (typeof Symbol("bar") !== "symbol") return false;
		return hasSymbolSham();
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/get-proto@1.0.1/node_modules/get-proto/Reflect.getPrototypeOf.js
var require_Reflect_getPrototypeOf = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = typeof Reflect !== "undefined" && Reflect.getPrototypeOf || null;
}));
//#endregion
//#region ../../node_modules/.pnpm/get-proto@1.0.1/node_modules/get-proto/Object.getPrototypeOf.js
var require_Object_getPrototypeOf = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = require_es_object_atoms().getPrototypeOf || null;
}));
//#endregion
//#region ../../node_modules/.pnpm/function-bind@1.1.2/node_modules/function-bind/implementation.js
var require_implementation = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var ERROR_MESSAGE = "Function.prototype.bind called on incompatible ";
	var toStr = Object.prototype.toString;
	var max = Math.max;
	var funcType = "[object Function]";
	var concatty = function concatty(a, b) {
		var arr = [];
		for (var i = 0; i < a.length; i += 1) arr[i] = a[i];
		for (var j = 0; j < b.length; j += 1) arr[j + a.length] = b[j];
		return arr;
	};
	var slicy = function slicy(arrLike, offset) {
		var arr = [];
		for (var i = offset || 0, j = 0; i < arrLike.length; i += 1, j += 1) arr[j] = arrLike[i];
		return arr;
	};
	var joiny = function(arr, joiner) {
		var str = "";
		for (var i = 0; i < arr.length; i += 1) {
			str += arr[i];
			if (i + 1 < arr.length) str += joiner;
		}
		return str;
	};
	module.exports = function bind(that) {
		var target = this;
		if (typeof target !== "function" || toStr.apply(target) !== funcType) throw new TypeError(ERROR_MESSAGE + target);
		var args = slicy(arguments, 1);
		var bound;
		var binder = function() {
			if (this instanceof bound) {
				var result = target.apply(this, concatty(args, arguments));
				if (Object(result) === result) return result;
				return this;
			}
			return target.apply(that, concatty(args, arguments));
		};
		var boundLength = max(0, target.length - args.length);
		var boundArgs = [];
		for (var i = 0; i < boundLength; i++) boundArgs[i] = "$" + i;
		bound = Function("binder", "return function (" + joiny(boundArgs, ",") + "){ return binder.apply(this,arguments); }")(binder);
		if (target.prototype) {
			var Empty = function Empty() {};
			Empty.prototype = target.prototype;
			bound.prototype = new Empty();
			Empty.prototype = null;
		}
		return bound;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/function-bind@1.1.2/node_modules/function-bind/index.js
var require_function_bind = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var implementation = require_implementation();
	module.exports = Function.prototype.bind || implementation;
}));
//#endregion
//#region ../../node_modules/.pnpm/call-bind-apply-helpers@1.0.2/node_modules/call-bind-apply-helpers/functionCall.js
var require_functionCall = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = Function.prototype.call;
}));
//#endregion
//#region ../../node_modules/.pnpm/call-bind-apply-helpers@1.0.2/node_modules/call-bind-apply-helpers/functionApply.js
var require_functionApply = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = Function.prototype.apply;
}));
//#endregion
//#region ../../node_modules/.pnpm/call-bind-apply-helpers@1.0.2/node_modules/call-bind-apply-helpers/reflectApply.js
var require_reflectApply = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = typeof Reflect !== "undefined" && Reflect && Reflect.apply;
}));
//#endregion
//#region ../../node_modules/.pnpm/call-bind-apply-helpers@1.0.2/node_modules/call-bind-apply-helpers/actualApply.js
var require_actualApply = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var bind = require_function_bind();
	var $apply = require_functionApply();
	var $call = require_functionCall();
	module.exports = require_reflectApply() || bind.call($call, $apply);
}));
//#endregion
//#region ../../node_modules/.pnpm/call-bind-apply-helpers@1.0.2/node_modules/call-bind-apply-helpers/index.js
var require_call_bind_apply_helpers = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var bind = require_function_bind();
	var $TypeError = require_type();
	var $call = require_functionCall();
	var $actualApply = require_actualApply();
	module.exports = function callBindBasic(args) {
		if (args.length < 1 || typeof args[0] !== "function") throw new $TypeError("a function is required");
		return $actualApply(bind, $call, args);
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/dunder-proto@1.0.1/node_modules/dunder-proto/get.js
var require_get = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var callBind = require_call_bind_apply_helpers();
	var gOPD = require_gopd();
	var hasProtoAccessor;
	try {
		hasProtoAccessor = [].__proto__ === Array.prototype;
	} catch (e) {
		if (!e || typeof e !== "object" || !("code" in e) || e.code !== "ERR_PROTO_ACCESS") throw e;
	}
	var desc = !!hasProtoAccessor && gOPD && gOPD(Object.prototype, "__proto__");
	var $Object = Object;
	var $getPrototypeOf = $Object.getPrototypeOf;
	module.exports = desc && typeof desc.get === "function" ? callBind([desc.get]) : typeof $getPrototypeOf === "function" ? function getDunder(value) {
		return $getPrototypeOf(value == null ? value : $Object(value));
	} : false;
}));
//#endregion
//#region ../../node_modules/.pnpm/get-proto@1.0.1/node_modules/get-proto/index.js
var require_get_proto = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var reflectGetProto = require_Reflect_getPrototypeOf();
	var originalGetProto = require_Object_getPrototypeOf();
	var getDunderProto = require_get();
	module.exports = reflectGetProto ? function getProto(O) {
		return reflectGetProto(O);
	} : originalGetProto ? function getProto(O) {
		if (!O || typeof O !== "object" && typeof O !== "function") throw new TypeError("getProto: not an object");
		return originalGetProto(O);
	} : getDunderProto ? function getProto(O) {
		return getDunderProto(O);
	} : null;
}));
//#endregion
//#region ../../node_modules/.pnpm/hasown@2.0.4/node_modules/hasown/index.js
var require_hasown = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var call = Function.prototype.call;
	var $hasOwn = Object.prototype.hasOwnProperty;
	module.exports = require_function_bind().call(call, $hasOwn);
}));
//#endregion
//#region ../../node_modules/.pnpm/get-intrinsic@1.3.0/node_modules/get-intrinsic/index.js
var require_get_intrinsic = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var undefined;
	var $Object = require_es_object_atoms();
	var $Error = require_es_errors();
	var $EvalError = require_eval();
	var $RangeError = require_range();
	var $ReferenceError = require_ref();
	var $SyntaxError = require_syntax();
	var $TypeError = require_type();
	var $URIError = require_uri();
	var abs = require_abs();
	var floor = require_floor();
	var max = require_max();
	var min = require_min();
	var pow = require_pow();
	var round = require_round();
	var sign = require_sign();
	var $Function = Function;
	var getEvalledConstructor = function(expressionSyntax) {
		try {
			return $Function("\"use strict\"; return (" + expressionSyntax + ").constructor;")();
		} catch (e) {}
	};
	var $gOPD = require_gopd();
	var $defineProperty = require_es_define_property();
	var throwTypeError = function() {
		throw new $TypeError();
	};
	var ThrowTypeError = $gOPD ? function() {
		try {
			arguments.callee;
			return throwTypeError;
		} catch (calleeThrows) {
			try {
				return $gOPD(arguments, "callee").get;
			} catch (gOPDthrows) {
				return throwTypeError;
			}
		}
	}() : throwTypeError;
	var hasSymbols = require_has_symbols()();
	var getProto = require_get_proto();
	var $ObjectGPO = require_Object_getPrototypeOf();
	var $ReflectGPO = require_Reflect_getPrototypeOf();
	var $apply = require_functionApply();
	var $call = require_functionCall();
	var needsEval = {};
	var TypedArray = typeof Uint8Array === "undefined" || !getProto ? undefined : getProto(Uint8Array);
	var INTRINSICS = {
		__proto__: null,
		"%AggregateError%": typeof AggregateError === "undefined" ? undefined : AggregateError,
		"%Array%": Array,
		"%ArrayBuffer%": typeof ArrayBuffer === "undefined" ? undefined : ArrayBuffer,
		"%ArrayIteratorPrototype%": hasSymbols && getProto ? getProto([][Symbol.iterator]()) : undefined,
		"%AsyncFromSyncIteratorPrototype%": undefined,
		"%AsyncFunction%": needsEval,
		"%AsyncGenerator%": needsEval,
		"%AsyncGeneratorFunction%": needsEval,
		"%AsyncIteratorPrototype%": needsEval,
		"%Atomics%": typeof Atomics === "undefined" ? undefined : Atomics,
		"%BigInt%": typeof BigInt === "undefined" ? undefined : BigInt,
		"%BigInt64Array%": typeof BigInt64Array === "undefined" ? undefined : BigInt64Array,
		"%BigUint64Array%": typeof BigUint64Array === "undefined" ? undefined : BigUint64Array,
		"%Boolean%": Boolean,
		"%DataView%": typeof DataView === "undefined" ? undefined : DataView,
		"%Date%": Date,
		"%decodeURI%": decodeURI,
		"%decodeURIComponent%": decodeURIComponent,
		"%encodeURI%": encodeURI,
		"%encodeURIComponent%": encodeURIComponent,
		"%Error%": $Error,
		"%eval%": eval,
		"%EvalError%": $EvalError,
		"%Float16Array%": typeof Float16Array === "undefined" ? undefined : Float16Array,
		"%Float32Array%": typeof Float32Array === "undefined" ? undefined : Float32Array,
		"%Float64Array%": typeof Float64Array === "undefined" ? undefined : Float64Array,
		"%FinalizationRegistry%": typeof FinalizationRegistry === "undefined" ? undefined : FinalizationRegistry,
		"%Function%": $Function,
		"%GeneratorFunction%": needsEval,
		"%Int8Array%": typeof Int8Array === "undefined" ? undefined : Int8Array,
		"%Int16Array%": typeof Int16Array === "undefined" ? undefined : Int16Array,
		"%Int32Array%": typeof Int32Array === "undefined" ? undefined : Int32Array,
		"%isFinite%": isFinite,
		"%isNaN%": isNaN,
		"%IteratorPrototype%": hasSymbols && getProto ? getProto(getProto([][Symbol.iterator]())) : undefined,
		"%JSON%": typeof JSON === "object" ? JSON : undefined,
		"%Map%": typeof Map === "undefined" ? undefined : Map,
		"%MapIteratorPrototype%": typeof Map === "undefined" || !hasSymbols || !getProto ? undefined : getProto((/* @__PURE__ */ new Map())[Symbol.iterator]()),
		"%Math%": Math,
		"%Number%": Number,
		"%Object%": $Object,
		"%Object.getOwnPropertyDescriptor%": $gOPD,
		"%parseFloat%": parseFloat,
		"%parseInt%": parseInt,
		"%Promise%": typeof Promise === "undefined" ? undefined : Promise,
		"%Proxy%": typeof Proxy === "undefined" ? undefined : Proxy,
		"%RangeError%": $RangeError,
		"%ReferenceError%": $ReferenceError,
		"%Reflect%": typeof Reflect === "undefined" ? undefined : Reflect,
		"%RegExp%": RegExp,
		"%Set%": typeof Set === "undefined" ? undefined : Set,
		"%SetIteratorPrototype%": typeof Set === "undefined" || !hasSymbols || !getProto ? undefined : getProto((/* @__PURE__ */ new Set())[Symbol.iterator]()),
		"%SharedArrayBuffer%": typeof SharedArrayBuffer === "undefined" ? undefined : SharedArrayBuffer,
		"%String%": String,
		"%StringIteratorPrototype%": hasSymbols && getProto ? getProto(""[Symbol.iterator]()) : undefined,
		"%Symbol%": hasSymbols ? Symbol : undefined,
		"%SyntaxError%": $SyntaxError,
		"%ThrowTypeError%": ThrowTypeError,
		"%TypedArray%": TypedArray,
		"%TypeError%": $TypeError,
		"%Uint8Array%": typeof Uint8Array === "undefined" ? undefined : Uint8Array,
		"%Uint8ClampedArray%": typeof Uint8ClampedArray === "undefined" ? undefined : Uint8ClampedArray,
		"%Uint16Array%": typeof Uint16Array === "undefined" ? undefined : Uint16Array,
		"%Uint32Array%": typeof Uint32Array === "undefined" ? undefined : Uint32Array,
		"%URIError%": $URIError,
		"%WeakMap%": typeof WeakMap === "undefined" ? undefined : WeakMap,
		"%WeakRef%": typeof WeakRef === "undefined" ? undefined : WeakRef,
		"%WeakSet%": typeof WeakSet === "undefined" ? undefined : WeakSet,
		"%Function.prototype.call%": $call,
		"%Function.prototype.apply%": $apply,
		"%Object.defineProperty%": $defineProperty,
		"%Object.getPrototypeOf%": $ObjectGPO,
		"%Math.abs%": abs,
		"%Math.floor%": floor,
		"%Math.max%": max,
		"%Math.min%": min,
		"%Math.pow%": pow,
		"%Math.round%": round,
		"%Math.sign%": sign,
		"%Reflect.getPrototypeOf%": $ReflectGPO
	};
	if (getProto) try {
		null.error;
	} catch (e) {
		INTRINSICS["%Error.prototype%"] = getProto(getProto(e));
	}
	var doEval = function doEval(name) {
		var value;
		if (name === "%AsyncFunction%") value = getEvalledConstructor("async function () {}");
		else if (name === "%GeneratorFunction%") value = getEvalledConstructor("function* () {}");
		else if (name === "%AsyncGeneratorFunction%") value = getEvalledConstructor("async function* () {}");
		else if (name === "%AsyncGenerator%") {
			var fn = doEval("%AsyncGeneratorFunction%");
			if (fn) value = fn.prototype;
		} else if (name === "%AsyncIteratorPrototype%") {
			var gen = doEval("%AsyncGenerator%");
			if (gen && getProto) value = getProto(gen.prototype);
		}
		INTRINSICS[name] = value;
		return value;
	};
	var LEGACY_ALIASES = {
		__proto__: null,
		"%ArrayBufferPrototype%": ["ArrayBuffer", "prototype"],
		"%ArrayPrototype%": ["Array", "prototype"],
		"%ArrayProto_entries%": [
			"Array",
			"prototype",
			"entries"
		],
		"%ArrayProto_forEach%": [
			"Array",
			"prototype",
			"forEach"
		],
		"%ArrayProto_keys%": [
			"Array",
			"prototype",
			"keys"
		],
		"%ArrayProto_values%": [
			"Array",
			"prototype",
			"values"
		],
		"%AsyncFunctionPrototype%": ["AsyncFunction", "prototype"],
		"%AsyncGenerator%": ["AsyncGeneratorFunction", "prototype"],
		"%AsyncGeneratorPrototype%": [
			"AsyncGeneratorFunction",
			"prototype",
			"prototype"
		],
		"%BooleanPrototype%": ["Boolean", "prototype"],
		"%DataViewPrototype%": ["DataView", "prototype"],
		"%DatePrototype%": ["Date", "prototype"],
		"%ErrorPrototype%": ["Error", "prototype"],
		"%EvalErrorPrototype%": ["EvalError", "prototype"],
		"%Float32ArrayPrototype%": ["Float32Array", "prototype"],
		"%Float64ArrayPrototype%": ["Float64Array", "prototype"],
		"%FunctionPrototype%": ["Function", "prototype"],
		"%Generator%": ["GeneratorFunction", "prototype"],
		"%GeneratorPrototype%": [
			"GeneratorFunction",
			"prototype",
			"prototype"
		],
		"%Int8ArrayPrototype%": ["Int8Array", "prototype"],
		"%Int16ArrayPrototype%": ["Int16Array", "prototype"],
		"%Int32ArrayPrototype%": ["Int32Array", "prototype"],
		"%JSONParse%": ["JSON", "parse"],
		"%JSONStringify%": ["JSON", "stringify"],
		"%MapPrototype%": ["Map", "prototype"],
		"%NumberPrototype%": ["Number", "prototype"],
		"%ObjectPrototype%": ["Object", "prototype"],
		"%ObjProto_toString%": [
			"Object",
			"prototype",
			"toString"
		],
		"%ObjProto_valueOf%": [
			"Object",
			"prototype",
			"valueOf"
		],
		"%PromisePrototype%": ["Promise", "prototype"],
		"%PromiseProto_then%": [
			"Promise",
			"prototype",
			"then"
		],
		"%Promise_all%": ["Promise", "all"],
		"%Promise_reject%": ["Promise", "reject"],
		"%Promise_resolve%": ["Promise", "resolve"],
		"%RangeErrorPrototype%": ["RangeError", "prototype"],
		"%ReferenceErrorPrototype%": ["ReferenceError", "prototype"],
		"%RegExpPrototype%": ["RegExp", "prototype"],
		"%SetPrototype%": ["Set", "prototype"],
		"%SharedArrayBufferPrototype%": ["SharedArrayBuffer", "prototype"],
		"%StringPrototype%": ["String", "prototype"],
		"%SymbolPrototype%": ["Symbol", "prototype"],
		"%SyntaxErrorPrototype%": ["SyntaxError", "prototype"],
		"%TypedArrayPrototype%": ["TypedArray", "prototype"],
		"%TypeErrorPrototype%": ["TypeError", "prototype"],
		"%Uint8ArrayPrototype%": ["Uint8Array", "prototype"],
		"%Uint8ClampedArrayPrototype%": ["Uint8ClampedArray", "prototype"],
		"%Uint16ArrayPrototype%": ["Uint16Array", "prototype"],
		"%Uint32ArrayPrototype%": ["Uint32Array", "prototype"],
		"%URIErrorPrototype%": ["URIError", "prototype"],
		"%WeakMapPrototype%": ["WeakMap", "prototype"],
		"%WeakSetPrototype%": ["WeakSet", "prototype"]
	};
	var bind = require_function_bind();
	var hasOwn = require_hasown();
	var $concat = bind.call($call, Array.prototype.concat);
	var $spliceApply = bind.call($apply, Array.prototype.splice);
	var $replace = bind.call($call, String.prototype.replace);
	var $strSlice = bind.call($call, String.prototype.slice);
	var $exec = bind.call($call, RegExp.prototype.exec);
	var rePropName = /[^%.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|%$))/g;
	var reEscapeChar = /\\(\\)?/g;
	var stringToPath = function stringToPath(string) {
		var first = $strSlice(string, 0, 1);
		var last = $strSlice(string, -1);
		if (first === "%" && last !== "%") throw new $SyntaxError("invalid intrinsic syntax, expected closing `%`");
		else if (last === "%" && first !== "%") throw new $SyntaxError("invalid intrinsic syntax, expected opening `%`");
		var result = [];
		$replace(string, rePropName, function(match, number, quote, subString) {
			result[result.length] = quote ? $replace(subString, reEscapeChar, "$1") : number || match;
		});
		return result;
	};
	var getBaseIntrinsic = function getBaseIntrinsic(name, allowMissing) {
		var intrinsicName = name;
		var alias;
		if (hasOwn(LEGACY_ALIASES, intrinsicName)) {
			alias = LEGACY_ALIASES[intrinsicName];
			intrinsicName = "%" + alias[0] + "%";
		}
		if (hasOwn(INTRINSICS, intrinsicName)) {
			var value = INTRINSICS[intrinsicName];
			if (value === needsEval) value = doEval(intrinsicName);
			if (typeof value === "undefined" && !allowMissing) throw new $TypeError("intrinsic " + name + " exists, but is not available. Please file an issue!");
			return {
				alias,
				name: intrinsicName,
				value
			};
		}
		throw new $SyntaxError("intrinsic " + name + " does not exist!");
	};
	module.exports = function GetIntrinsic(name, allowMissing) {
		if (typeof name !== "string" || name.length === 0) throw new $TypeError("intrinsic name must be a non-empty string");
		if (arguments.length > 1 && typeof allowMissing !== "boolean") throw new $TypeError("\"allowMissing\" argument must be a boolean");
		if ($exec(/^%?[^%]*%?$/, name) === null) throw new $SyntaxError("`%` may not be present anywhere but at the beginning and end of the intrinsic name");
		var parts = stringToPath(name);
		var intrinsicBaseName = parts.length > 0 ? parts[0] : "";
		var intrinsic = getBaseIntrinsic("%" + intrinsicBaseName + "%", allowMissing);
		var intrinsicRealName = intrinsic.name;
		var value = intrinsic.value;
		var skipFurtherCaching = false;
		var alias = intrinsic.alias;
		if (alias) {
			intrinsicBaseName = alias[0];
			$spliceApply(parts, $concat([0, 1], alias));
		}
		for (var i = 1, isOwn = true; i < parts.length; i += 1) {
			var part = parts[i];
			var first = $strSlice(part, 0, 1);
			var last = $strSlice(part, -1);
			if ((first === "\"" || first === "'" || first === "`" || last === "\"" || last === "'" || last === "`") && first !== last) throw new $SyntaxError("property names with quotes must have matching quotes");
			if (part === "constructor" || !isOwn) skipFurtherCaching = true;
			intrinsicBaseName += "." + part;
			intrinsicRealName = "%" + intrinsicBaseName + "%";
			if (hasOwn(INTRINSICS, intrinsicRealName)) value = INTRINSICS[intrinsicRealName];
			else if (value != null) {
				if (!(part in value)) {
					if (!allowMissing) throw new $TypeError("base intrinsic for " + name + " exists, but the property is not available.");
					return;
				}
				if ($gOPD && i + 1 >= parts.length) {
					var desc = $gOPD(value, part);
					isOwn = !!desc;
					if (isOwn && "get" in desc && !("originalValue" in desc.get)) value = desc.get;
					else value = value[part];
				} else {
					isOwn = hasOwn(value, part);
					value = value[part];
				}
				if (isOwn && !skipFurtherCaching) INTRINSICS[intrinsicRealName] = value;
			}
		}
		return value;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/call-bound@1.0.4/node_modules/call-bound/index.js
var require_call_bound = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var GetIntrinsic = require_get_intrinsic();
	var callBindBasic = require_call_bind_apply_helpers();
	var $indexOf = callBindBasic([GetIntrinsic("%String.prototype.indexOf%")]);
	module.exports = function callBoundIntrinsic(name, allowMissing) {
		var intrinsic = GetIntrinsic(name, !!allowMissing);
		if (typeof intrinsic === "function" && $indexOf(name, ".prototype.") > -1) return callBindBasic([intrinsic]);
		return intrinsic;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/is-arguments@1.2.0/node_modules/is-arguments/index.js
var require_is_arguments = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var hasToStringTag = require_shams()();
	var $toString = require_call_bound()("Object.prototype.toString");
	var isStandardArguments = function isArguments(value) {
		if (hasToStringTag && value && typeof value === "object" && Symbol.toStringTag in value) return false;
		return $toString(value) === "[object Arguments]";
	};
	var isLegacyArguments = function isArguments(value) {
		if (isStandardArguments(value)) return true;
		return value !== null && typeof value === "object" && "length" in value && typeof value.length === "number" && value.length >= 0 && $toString(value) !== "[object Array]" && "callee" in value && $toString(value.callee) === "[object Function]";
	};
	var supportsStandardArguments = function() {
		return isStandardArguments(arguments);
	}();
	isStandardArguments.isLegacyArguments = isLegacyArguments;
	module.exports = supportsStandardArguments ? isStandardArguments : isLegacyArguments;
}));
//#endregion
//#region ../../node_modules/.pnpm/is-regex@1.2.1/node_modules/is-regex/index.js
var require_is_regex = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var callBound = require_call_bound();
	var hasToStringTag = require_shams()();
	var hasOwn = require_hasown();
	var gOPD = require_gopd();
	var fn;
	if (hasToStringTag) {
		var $exec = callBound("RegExp.prototype.exec");
		var isRegexMarker = {};
		var throwRegexMarker = function() {
			throw isRegexMarker;
		};
		var badStringifier = {
			toString: throwRegexMarker,
			valueOf: throwRegexMarker
		};
		if (typeof Symbol.toPrimitive === "symbol") badStringifier[Symbol.toPrimitive] = throwRegexMarker;
		fn = function isRegex(value) {
			if (!value || typeof value !== "object") return false;
			var descriptor = gOPD(value, "lastIndex");
			if (!(descriptor && hasOwn(descriptor, "value"))) return false;
			try {
				$exec(value, badStringifier);
			} catch (e) {
				return e === isRegexMarker;
			}
		};
	} else {
		var $toString = callBound("Object.prototype.toString");
		var regexClass = "[object RegExp]";
		fn = function isRegex(value) {
			if (!value || typeof value !== "object" && typeof value !== "function") return false;
			return $toString(value) === regexClass;
		};
	}
	module.exports = fn;
}));
//#endregion
//#region ../../node_modules/.pnpm/safe-regex-test@1.1.0/node_modules/safe-regex-test/index.js
var require_safe_regex_test = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var callBound = require_call_bound();
	var isRegex = require_is_regex();
	var $exec = callBound("RegExp.prototype.exec");
	var $TypeError = require_type();
	module.exports = function regexTester(regex) {
		if (!isRegex(regex)) throw new $TypeError("`regex` must be a RegExp");
		return function test(s) {
			return $exec(regex, s) !== null;
		};
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/generator-function@2.0.1/node_modules/generator-function/index.js
var require_generator_function = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const cached = function* () {}.constructor;
	module.exports = () => cached;
}));
//#endregion
//#region ../../node_modules/.pnpm/is-generator-function@1.1.2/node_modules/is-generator-function/index.js
var require_is_generator_function = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var callBound = require_call_bound();
	var isFnRegex = require_safe_regex_test()(/^\s*(?:function)?\*/);
	var hasToStringTag = require_shams()();
	var getProto = require_get_proto();
	var toStr = callBound("Object.prototype.toString");
	var fnToStr = callBound("Function.prototype.toString");
	var getGeneratorFunction = require_generator_function();
	module.exports = function isGeneratorFunction(fn) {
		if (typeof fn !== "function") return false;
		if (isFnRegex(fnToStr(fn))) return true;
		if (!hasToStringTag) return toStr(fn) === "[object GeneratorFunction]";
		if (!getProto) return false;
		var GeneratorFunction = getGeneratorFunction();
		return GeneratorFunction && getProto(fn) === GeneratorFunction.prototype;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/is-callable@1.2.7/node_modules/is-callable/index.js
var require_is_callable = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var fnToStr = Function.prototype.toString;
	var reflectApply = typeof Reflect === "object" && Reflect !== null && Reflect.apply;
	var badArrayLike;
	var isCallableMarker;
	if (typeof reflectApply === "function" && typeof Object.defineProperty === "function") try {
		badArrayLike = Object.defineProperty({}, "length", { get: function() {
			throw isCallableMarker;
		} });
		isCallableMarker = {};
		reflectApply(function() {
			throw 42;
		}, null, badArrayLike);
	} catch (_) {
		if (_ !== isCallableMarker) reflectApply = null;
	}
	else reflectApply = null;
	var constructorRegex = /^\s*class\b/;
	var isES6ClassFn = function isES6ClassFunction(value) {
		try {
			var fnStr = fnToStr.call(value);
			return constructorRegex.test(fnStr);
		} catch (e) {
			return false;
		}
	};
	var tryFunctionObject = function tryFunctionToStr(value) {
		try {
			if (isES6ClassFn(value)) return false;
			fnToStr.call(value);
			return true;
		} catch (e) {
			return false;
		}
	};
	var toStr = Object.prototype.toString;
	var objectClass = "[object Object]";
	var fnClass = "[object Function]";
	var genClass = "[object GeneratorFunction]";
	var ddaClass = "[object HTMLAllCollection]";
	var ddaClass2 = "[object HTML document.all class]";
	var ddaClass3 = "[object HTMLCollection]";
	var hasToStringTag = typeof Symbol === "function" && !!Symbol.toStringTag;
	var isIE68 = !(0 in [,]);
	var isDDA = function isDocumentDotAll() {
		return false;
	};
	if (typeof document === "object") {
		var all = document.all;
		if (toStr.call(all) === toStr.call(document.all)) isDDA = function isDocumentDotAll(value) {
			if ((isIE68 || !value) && (typeof value === "undefined" || typeof value === "object")) try {
				var str = toStr.call(value);
				return (str === ddaClass || str === ddaClass2 || str === ddaClass3 || str === objectClass) && value("") == null;
			} catch (e) {}
			return false;
		};
	}
	module.exports = reflectApply ? function isCallable(value) {
		if (isDDA(value)) return true;
		if (!value) return false;
		if (typeof value !== "function" && typeof value !== "object") return false;
		try {
			reflectApply(value, null, badArrayLike);
		} catch (e) {
			if (e !== isCallableMarker) return false;
		}
		return !isES6ClassFn(value) && tryFunctionObject(value);
	} : function isCallable(value) {
		if (isDDA(value)) return true;
		if (!value) return false;
		if (typeof value !== "function" && typeof value !== "object") return false;
		if (hasToStringTag) return tryFunctionObject(value);
		if (isES6ClassFn(value)) return false;
		var strClass = toStr.call(value);
		if (strClass !== fnClass && strClass !== genClass && !/^\[object HTML/.test(strClass)) return false;
		return tryFunctionObject(value);
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/for-each@0.3.5/node_modules/for-each/index.js
var require_for_each = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var isCallable = require_is_callable();
	var toStr = Object.prototype.toString;
	var hasOwnProperty = Object.prototype.hasOwnProperty;
	var forEachArray = function forEachArray(array, iterator, receiver) {
		for (var i = 0, len = array.length; i < len; i++) if (hasOwnProperty.call(array, i)) {
			if (receiver == null) iterator(array[i], i, array);
			else iterator.call(receiver, array[i], i, array);
		}
	};
	var forEachString = function forEachString(string, iterator, receiver) {
		for (var i = 0, len = string.length; i < len; i++) if (receiver == null) iterator(string.charAt(i), i, string);
		else iterator.call(receiver, string.charAt(i), i, string);
	};
	var forEachObject = function forEachObject(object, iterator, receiver) {
		for (var k in object) if (hasOwnProperty.call(object, k)) {
			if (receiver == null) iterator(object[k], k, object);
			else iterator.call(receiver, object[k], k, object);
		}
	};
	function isArray(x) {
		return toStr.call(x) === "[object Array]";
	}
	module.exports = function forEach(list, iterator, thisArg) {
		if (!isCallable(iterator)) throw new TypeError("iterator must be a function");
		var receiver;
		if (arguments.length >= 3) receiver = thisArg;
		if (isArray(list)) forEachArray(list, iterator, receiver);
		else if (typeof list === "string") forEachString(list, iterator, receiver);
		else forEachObject(list, iterator, receiver);
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/possible-typed-array-names@1.1.0/node_modules/possible-typed-array-names/index.js
var require_possible_typed_array_names = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = [
		"Float16Array",
		"Float32Array",
		"Float64Array",
		"Int8Array",
		"Int16Array",
		"Int32Array",
		"Uint8Array",
		"Uint8ClampedArray",
		"Uint16Array",
		"Uint32Array",
		"BigInt64Array",
		"BigUint64Array"
	];
}));
//#endregion
//#region ../../node_modules/.pnpm/available-typed-arrays@1.0.7/node_modules/available-typed-arrays/index.js
var require_available_typed_arrays = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var possibleNames = require_possible_typed_array_names();
	var g = typeof globalThis === "undefined" ? global : globalThis;
	module.exports = function availableTypedArrays() {
		var out = [];
		for (var i = 0; i < possibleNames.length; i++) if (typeof g[possibleNames[i]] === "function") out[out.length] = possibleNames[i];
		return out;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/define-data-property@1.1.4/node_modules/define-data-property/index.js
var require_define_data_property = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var $defineProperty = require_es_define_property();
	var $SyntaxError = require_syntax();
	var $TypeError = require_type();
	var gopd = require_gopd();
	module.exports = function defineDataProperty(obj, property, value) {
		if (!obj || typeof obj !== "object" && typeof obj !== "function") throw new $TypeError("`obj` must be an object or a function`");
		if (typeof property !== "string" && typeof property !== "symbol") throw new $TypeError("`property` must be a string or a symbol`");
		if (arguments.length > 3 && typeof arguments[3] !== "boolean" && arguments[3] !== null) throw new $TypeError("`nonEnumerable`, if provided, must be a boolean or null");
		if (arguments.length > 4 && typeof arguments[4] !== "boolean" && arguments[4] !== null) throw new $TypeError("`nonWritable`, if provided, must be a boolean or null");
		if (arguments.length > 5 && typeof arguments[5] !== "boolean" && arguments[5] !== null) throw new $TypeError("`nonConfigurable`, if provided, must be a boolean or null");
		if (arguments.length > 6 && typeof arguments[6] !== "boolean") throw new $TypeError("`loose`, if provided, must be a boolean");
		var nonEnumerable = arguments.length > 3 ? arguments[3] : null;
		var nonWritable = arguments.length > 4 ? arguments[4] : null;
		var nonConfigurable = arguments.length > 5 ? arguments[5] : null;
		var loose = arguments.length > 6 ? arguments[6] : false;
		var desc = !!gopd && gopd(obj, property);
		if ($defineProperty) $defineProperty(obj, property, {
			configurable: nonConfigurable === null && desc ? desc.configurable : !nonConfigurable,
			enumerable: nonEnumerable === null && desc ? desc.enumerable : !nonEnumerable,
			value,
			writable: nonWritable === null && desc ? desc.writable : !nonWritable
		});
		else if (loose || !nonEnumerable && !nonWritable && !nonConfigurable) obj[property] = value;
		else throw new $SyntaxError("This environment does not support defining a property as non-configurable, non-writable, or non-enumerable.");
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/has-property-descriptors@1.0.2/node_modules/has-property-descriptors/index.js
var require_has_property_descriptors = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var $defineProperty = require_es_define_property();
	var hasPropertyDescriptors = function hasPropertyDescriptors() {
		return !!$defineProperty;
	};
	hasPropertyDescriptors.hasArrayLengthDefineBug = function hasArrayLengthDefineBug() {
		if (!$defineProperty) return null;
		try {
			return $defineProperty([], "length", { value: 1 }).length !== 1;
		} catch (e) {
			return true;
		}
	};
	module.exports = hasPropertyDescriptors;
}));
//#endregion
//#region ../../node_modules/.pnpm/set-function-length@1.2.2/node_modules/set-function-length/index.js
var require_set_function_length = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var GetIntrinsic = require_get_intrinsic();
	var define = require_define_data_property();
	var hasDescriptors = require_has_property_descriptors()();
	var gOPD = require_gopd();
	var $TypeError = require_type();
	var $floor = GetIntrinsic("%Math.floor%");
	module.exports = function setFunctionLength(fn, length) {
		if (typeof fn !== "function") throw new $TypeError("`fn` is not a function");
		if (typeof length !== "number" || length < 0 || length > 4294967295 || $floor(length) !== length) throw new $TypeError("`length` must be a positive 32-bit integer");
		var loose = arguments.length > 2 && !!arguments[2];
		var functionLengthIsConfigurable = true;
		var functionLengthIsWritable = true;
		if ("length" in fn && gOPD) {
			var desc = gOPD(fn, "length");
			if (desc && !desc.configurable) functionLengthIsConfigurable = false;
			if (desc && !desc.writable) functionLengthIsWritable = false;
		}
		if (functionLengthIsConfigurable || functionLengthIsWritable || !loose) {
			if (hasDescriptors) define(fn, "length", length, true, true);
			else define(fn, "length", length);
		}
		return fn;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/call-bind-apply-helpers@1.0.2/node_modules/call-bind-apply-helpers/applyBind.js
var require_applyBind = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var bind = require_function_bind();
	var $apply = require_functionApply();
	var actualApply = require_actualApply();
	module.exports = function applyBind() {
		return actualApply(bind, $apply, arguments);
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/call-bind@1.0.9/node_modules/call-bind/index.js
var require_call_bind = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var setFunctionLength = require_set_function_length();
	var $defineProperty = require_es_define_property();
	var callBindBasic = require_call_bind_apply_helpers();
	var applyBind = require_applyBind();
	module.exports = function callBind(originalFunction) {
		var func = callBindBasic(arguments);
		var adjustedLength = 1 + originalFunction.length - (arguments.length - 1);
		return setFunctionLength(func, adjustedLength > 0 ? adjustedLength : 0, true);
	};
	if ($defineProperty) $defineProperty(module.exports, "apply", { value: applyBind });
	else module.exports.apply = applyBind;
}));
//#endregion
//#region ../../node_modules/.pnpm/which-typed-array@1.1.24/node_modules/which-typed-array/index.js
var require_which_typed_array = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var forEach = require_for_each();
	var availableTypedArrays = require_available_typed_arrays();
	var callBind = require_call_bind();
	var callBound = require_call_bound();
	var gOPD = require_gopd();
	var getProto = require_get_proto();
	var $toString = callBound("Object.prototype.toString");
	var hasToStringTag = require_shams()();
	var g = typeof globalThis === "undefined" ? global : globalThis;
	var typedArrays = availableTypedArrays();
	var $slice = callBound("String.prototype.slice");
	var $indexOf = callBound("Array.prototype.indexOf", true) || function indexOf(array, value) {
		for (var i = 0; i < array.length; i += 1) if (array[i] === value) return i;
		return -1;
	};
	var cache = { __proto__: null };
	if (hasToStringTag && gOPD && getProto) forEach(typedArrays, function(typedArray) {
		var arr = new g[typedArray]();
		if (Symbol.toStringTag in arr && getProto) {
			var proto = getProto(arr);
			var descriptor = gOPD(proto, Symbol.toStringTag);
			if (!descriptor && proto) descriptor = gOPD(getProto(proto), Symbol.toStringTag);
			if (descriptor && descriptor.get) {
				var bound = callBind(descriptor.get);
				cache["$" + typedArray] = bound;
			}
		}
	});
	else forEach(typedArrays, function(typedArray) {
		var arr = new g[typedArray]();
		var fn = arr.slice || arr.set;
		if (fn) {
			var bound = callBind(fn);
			cache["$" + typedArray] = bound;
		}
	});
	function tryTypedArrays(value) {
		var found = false;
		forEach(cache, function(getter, typedArray) {
			if (!found) try {
				if ("$" + getter(value) === typedArray) found = $slice(typedArray, 1);
			} catch (e) {}
		});
		return found;
	}
	function trySlices(value) {
		var found = false;
		forEach(cache, function(getter, name) {
			if (!found) try {
				getter(value);
				found = $slice(name, 1);
			} catch (e) {}
		});
		return found;
	}
	function isTATag(tag) {
		return $indexOf(typedArrays, tag) > -1;
	}
	function whichTypedArray(value) {
		if (!value || typeof value !== "object") return false;
		if (!hasToStringTag) {
			var tag = $slice($toString(value), 8, -1);
			if (isTATag(tag)) return tag;
			if (tag !== "Object") return false;
			return trySlices(value);
		}
		if (!gOPD) return null;
		return tryTypedArrays(value);
	}
	module.exports = whichTypedArray;
}));
//#endregion
//#region ../../node_modules/.pnpm/is-typed-array@1.1.15/node_modules/is-typed-array/index.js
var require_is_typed_array = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var whichTypedArray = require_which_typed_array();
	module.exports = function isTypedArray(value) {
		return !!whichTypedArray(value);
	};
}));
//#endregion
//#region src/node/util/types.ts
var import_types = /* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports) => {
	var isArgumentsObject = require_is_arguments();
	var isGeneratorFunction = require_is_generator_function();
	var whichTypedArray = require_which_typed_array();
	var isTypedArray = require_is_typed_array();
	function uncurryThis(f) {
		return f.call.bind(f);
	}
	var BigIntSupported = typeof BigInt !== "undefined";
	var SymbolSupported = typeof Symbol !== "undefined";
	var ObjectToString = uncurryThis(Object.prototype.toString);
	var numberValue = uncurryThis(Number.prototype.valueOf);
	var stringValue = uncurryThis(String.prototype.valueOf);
	var booleanValue = uncurryThis(Boolean.prototype.valueOf);
	if (BigIntSupported) var bigIntValue = uncurryThis(BigInt.prototype.valueOf);
	if (SymbolSupported) var symbolValue = uncurryThis(Symbol.prototype.valueOf);
	function checkBoxedPrimitive(value, prototypeValueOf) {
		if (typeof value !== "object") return false;
		try {
			prototypeValueOf(value);
			return true;
		} catch (e) {
			return false;
		}
	}
	exports.isArgumentsObject = isArgumentsObject;
	exports.isGeneratorFunction = isGeneratorFunction;
	exports.isTypedArray = isTypedArray;
	function isPromise(input) {
		return typeof Promise !== "undefined" && input instanceof Promise || input !== null && typeof input === "object" && typeof input.then === "function" && typeof input.catch === "function";
	}
	exports.isPromise = isPromise;
	function isArrayBufferView(value) {
		if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView) return ArrayBuffer.isView(value);
		return isTypedArray(value) || isDataView(value);
	}
	exports.isArrayBufferView = isArrayBufferView;
	function isUint8Array(value) {
		return whichTypedArray(value) === "Uint8Array";
	}
	exports.isUint8Array = isUint8Array;
	function isUint8ClampedArray(value) {
		return whichTypedArray(value) === "Uint8ClampedArray";
	}
	exports.isUint8ClampedArray = isUint8ClampedArray;
	function isUint16Array(value) {
		return whichTypedArray(value) === "Uint16Array";
	}
	exports.isUint16Array = isUint16Array;
	function isUint32Array(value) {
		return whichTypedArray(value) === "Uint32Array";
	}
	exports.isUint32Array = isUint32Array;
	function isInt8Array(value) {
		return whichTypedArray(value) === "Int8Array";
	}
	exports.isInt8Array = isInt8Array;
	function isInt16Array(value) {
		return whichTypedArray(value) === "Int16Array";
	}
	exports.isInt16Array = isInt16Array;
	function isInt32Array(value) {
		return whichTypedArray(value) === "Int32Array";
	}
	exports.isInt32Array = isInt32Array;
	function isFloat32Array(value) {
		return whichTypedArray(value) === "Float32Array";
	}
	exports.isFloat32Array = isFloat32Array;
	function isFloat64Array(value) {
		return whichTypedArray(value) === "Float64Array";
	}
	exports.isFloat64Array = isFloat64Array;
	function isBigInt64Array(value) {
		return whichTypedArray(value) === "BigInt64Array";
	}
	exports.isBigInt64Array = isBigInt64Array;
	function isBigUint64Array(value) {
		return whichTypedArray(value) === "BigUint64Array";
	}
	exports.isBigUint64Array = isBigUint64Array;
	function isMapToString(value) {
		return ObjectToString(value) === "[object Map]";
	}
	isMapToString.working = typeof Map !== "undefined" && isMapToString(/* @__PURE__ */ new Map());
	function isMap(value) {
		if (typeof Map === "undefined") return false;
		return isMapToString.working ? isMapToString(value) : value instanceof Map;
	}
	exports.isMap = isMap;
	function isSetToString(value) {
		return ObjectToString(value) === "[object Set]";
	}
	isSetToString.working = typeof Set !== "undefined" && isSetToString(/* @__PURE__ */ new Set());
	function isSet(value) {
		if (typeof Set === "undefined") return false;
		return isSetToString.working ? isSetToString(value) : value instanceof Set;
	}
	exports.isSet = isSet;
	function isWeakMapToString(value) {
		return ObjectToString(value) === "[object WeakMap]";
	}
	isWeakMapToString.working = typeof WeakMap !== "undefined" && isWeakMapToString(/* @__PURE__ */ new WeakMap());
	function isWeakMap(value) {
		if (typeof WeakMap === "undefined") return false;
		return isWeakMapToString.working ? isWeakMapToString(value) : value instanceof WeakMap;
	}
	exports.isWeakMap = isWeakMap;
	function isWeakSetToString(value) {
		return ObjectToString(value) === "[object WeakSet]";
	}
	isWeakSetToString.working = typeof WeakSet !== "undefined" && isWeakSetToString(/* @__PURE__ */ new WeakSet());
	function isWeakSet(value) {
		return isWeakSetToString(value);
	}
	exports.isWeakSet = isWeakSet;
	function isArrayBufferToString(value) {
		return ObjectToString(value) === "[object ArrayBuffer]";
	}
	isArrayBufferToString.working = typeof ArrayBuffer !== "undefined" && isArrayBufferToString(/* @__PURE__ */ new ArrayBuffer());
	function isArrayBuffer(value) {
		if (typeof ArrayBuffer === "undefined") return false;
		return isArrayBufferToString.working ? isArrayBufferToString(value) : value instanceof ArrayBuffer;
	}
	exports.isArrayBuffer = isArrayBuffer;
	function isDataViewToString(value) {
		return ObjectToString(value) === "[object DataView]";
	}
	isDataViewToString.working = typeof ArrayBuffer !== "undefined" && typeof DataView !== "undefined" && isDataViewToString(new DataView(/* @__PURE__ */ new ArrayBuffer(1), 0, 1));
	function isDataView(value) {
		if (typeof DataView === "undefined") return false;
		return isDataViewToString.working ? isDataViewToString(value) : value instanceof DataView;
	}
	exports.isDataView = isDataView;
	var SharedArrayBufferCopy = typeof SharedArrayBuffer !== "undefined" ? SharedArrayBuffer : void 0;
	function isSharedArrayBufferToString(value) {
		return ObjectToString(value) === "[object SharedArrayBuffer]";
	}
	function isSharedArrayBuffer(value) {
		if (typeof SharedArrayBufferCopy === "undefined") return false;
		if (typeof isSharedArrayBufferToString.working === "undefined") isSharedArrayBufferToString.working = isSharedArrayBufferToString(new SharedArrayBufferCopy());
		return isSharedArrayBufferToString.working ? isSharedArrayBufferToString(value) : value instanceof SharedArrayBufferCopy;
	}
	exports.isSharedArrayBuffer = isSharedArrayBuffer;
	function isAsyncFunction(value) {
		return ObjectToString(value) === "[object AsyncFunction]";
	}
	exports.isAsyncFunction = isAsyncFunction;
	function isMapIterator(value) {
		return ObjectToString(value) === "[object Map Iterator]";
	}
	exports.isMapIterator = isMapIterator;
	function isSetIterator(value) {
		return ObjectToString(value) === "[object Set Iterator]";
	}
	exports.isSetIterator = isSetIterator;
	function isGeneratorObject(value) {
		return ObjectToString(value) === "[object Generator]";
	}
	exports.isGeneratorObject = isGeneratorObject;
	function isWebAssemblyCompiledModule(value) {
		return ObjectToString(value) === "[object WebAssembly.Module]";
	}
	exports.isWebAssemblyCompiledModule = isWebAssemblyCompiledModule;
	function isNumberObject(value) {
		return checkBoxedPrimitive(value, numberValue);
	}
	exports.isNumberObject = isNumberObject;
	function isStringObject(value) {
		return checkBoxedPrimitive(value, stringValue);
	}
	exports.isStringObject = isStringObject;
	function isBooleanObject(value) {
		return checkBoxedPrimitive(value, booleanValue);
	}
	exports.isBooleanObject = isBooleanObject;
	function isBigIntObject(value) {
		return BigIntSupported && checkBoxedPrimitive(value, bigIntValue);
	}
	exports.isBigIntObject = isBigIntObject;
	function isSymbolObject(value) {
		return SymbolSupported && checkBoxedPrimitive(value, symbolValue);
	}
	exports.isSymbolObject = isSymbolObject;
	function isBoxedPrimitive(value) {
		return isNumberObject(value) || isStringObject(value) || isBooleanObject(value) || isBigIntObject(value) || isSymbolObject(value);
	}
	exports.isBoxedPrimitive = isBoxedPrimitive;
	function isAnyArrayBuffer(value) {
		return typeof Uint8Array !== "undefined" && (isArrayBuffer(value) || isSharedArrayBuffer(value));
	}
	exports.isAnyArrayBuffer = isAnyArrayBuffer;
	[
		"isProxy",
		"isExternal",
		"isModuleNamespaceObject"
	].forEach(function(method) {
		Object.defineProperty(exports, method, {
			enumerable: false,
			value: function() {
				throw new Error(method + " is not supported in userland");
			}
		});
	});
})))(), 1);
const nativeError = (value) => value instanceof Error || Object.prototype.toString.call(value) === "[object Error]";
const cryptoKey = (value) => typeof CryptoKey !== "undefined" && value instanceof CryptoKey;
const types = {
	...types_default,
	...import_types.default,
	isNativeError: nativeError,
	isCryptoKey: cryptoKey
};
const isExternal = types.isExternal;
const isDate = types.isDate;
const isArgumentsObject = types.isArgumentsObject;
const isBigIntObject = types.isBigIntObject;
const isBooleanObject = types.isBooleanObject;
const isNumberObject = types.isNumberObject;
const isStringObject = types.isStringObject;
const isSymbolObject = types.isSymbolObject;
const isNativeError = types.isNativeError;
const isRegExp = types.isRegExp;
const isAsyncFunction = types.isAsyncFunction;
const isGeneratorFunction = types.isGeneratorFunction;
const isGeneratorObject = types.isGeneratorObject;
const isPromise = types.isPromise;
const isMap = types.isMap;
const isSet = types.isSet;
const isMapIterator = types.isMapIterator;
const isSetIterator = types.isSetIterator;
const isWeakMap = types.isWeakMap;
const isWeakSet = types.isWeakSet;
const isArrayBuffer = types.isArrayBuffer;
const isDataView = types.isDataView;
const isSharedArrayBuffer = types.isSharedArrayBuffer;
const isProxy = types.isProxy;
const isModuleNamespaceObject = types.isModuleNamespaceObject;
const isAnyArrayBuffer = types.isAnyArrayBuffer;
const isBoxedPrimitive = types.isBoxedPrimitive;
const isArrayBufferView = types.isArrayBufferView;
const isTypedArray = types.isTypedArray;
const isUint8Array = types.isUint8Array;
const isUint8ClampedArray = types.isUint8ClampedArray;
const isUint16Array = types.isUint16Array;
const isUint32Array = types.isUint32Array;
const isInt8Array = types.isInt8Array;
const isInt16Array = types.isInt16Array;
const isInt32Array = types.isInt32Array;
const isFloat32Array = types.isFloat32Array;
const isFloat64Array = types.isFloat64Array;
const isBigInt64Array = types.isBigInt64Array;
const isBigUint64Array = types.isBigUint64Array;
const isKeyObject = types.isKeyObject;
const isCryptoKey = types.isCryptoKey;
//#endregion
export { types as default, isAnyArrayBuffer, isArgumentsObject, isArrayBuffer, isArrayBufferView, isAsyncFunction, isBigInt64Array, isBigIntObject, isBigUint64Array, isBooleanObject, isBoxedPrimitive, isCryptoKey, isDataView, isDate, isExternal, isFloat32Array, isFloat64Array, isGeneratorFunction, isGeneratorObject, isInt16Array, isInt32Array, isInt8Array, isKeyObject, isMap, isMapIterator, isModuleNamespaceObject, isNativeError, isNumberObject, isPromise, isProxy, isRegExp, isSet, isSetIterator, isSharedArrayBuffer, isStringObject, isSymbolObject, isTypedArray, isUint16Array, isUint32Array, isUint8Array, isUint8ClampedArray, isWeakMap, isWeakSet };
