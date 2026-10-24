import __process from "process";
const process = __process;
import * as m from "util";
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
//#region \0require-as-import:util
var require__require_as_import_util = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = m.default;
}));
//#endregion
//#region ../../node_modules/.pnpm/assert@2.1.0/node_modules/assert/build/internal/errors.js
var require_errors = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	function _typeof(o) {
		"@babel/helpers - typeof";
		return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
			return typeof o;
		} : function(o) {
			return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
		}, _typeof(o);
	}
	function _defineProperties(target, props) {
		for (var i = 0; i < props.length; i++) {
			var descriptor = props[i];
			descriptor.enumerable = descriptor.enumerable || false;
			descriptor.configurable = true;
			if ("value" in descriptor) descriptor.writable = true;
			Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor);
		}
	}
	function _createClass(Constructor, protoProps, staticProps) {
		if (protoProps) _defineProperties(Constructor.prototype, protoProps);
		if (staticProps) _defineProperties(Constructor, staticProps);
		Object.defineProperty(Constructor, "prototype", { writable: false });
		return Constructor;
	}
	function _toPropertyKey(arg) {
		var key = _toPrimitive(arg, "string");
		return _typeof(key) === "symbol" ? key : String(key);
	}
	function _toPrimitive(input, hint) {
		if (_typeof(input) !== "object" || input === null) return input;
		var prim = input[Symbol.toPrimitive];
		if (prim !== void 0) {
			var res = prim.call(input, hint || "default");
			if (_typeof(res) !== "object") return res;
			throw new TypeError("@@toPrimitive must return a primitive value.");
		}
		return (hint === "string" ? String : Number)(input);
	}
	function _classCallCheck(instance, Constructor) {
		if (!(instance instanceof Constructor)) throw new TypeError("Cannot call a class as a function");
	}
	function _inherits(subClass, superClass) {
		if (typeof superClass !== "function" && superClass !== null) throw new TypeError("Super expression must either be null or a function");
		subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: {
			value: subClass,
			writable: true,
			configurable: true
		} });
		Object.defineProperty(subClass, "prototype", { writable: false });
		if (superClass) _setPrototypeOf(subClass, superClass);
	}
	function _setPrototypeOf(o, p) {
		_setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function _setPrototypeOf(o, p) {
			o.__proto__ = p;
			return o;
		};
		return _setPrototypeOf(o, p);
	}
	function _createSuper(Derived) {
		var hasNativeReflectConstruct = _isNativeReflectConstruct();
		return function _createSuperInternal() {
			var Super = _getPrototypeOf(Derived), result;
			if (hasNativeReflectConstruct) {
				var NewTarget = _getPrototypeOf(this).constructor;
				result = Reflect.construct(Super, arguments, NewTarget);
			} else result = Super.apply(this, arguments);
			return _possibleConstructorReturn(this, result);
		};
	}
	function _possibleConstructorReturn(self, call) {
		if (call && (_typeof(call) === "object" || typeof call === "function")) return call;
		else if (call !== void 0) throw new TypeError("Derived constructors may only return object or undefined");
		return _assertThisInitialized(self);
	}
	function _assertThisInitialized(self) {
		if (self === void 0) throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
		return self;
	}
	function _isNativeReflectConstruct() {
		if (typeof Reflect === "undefined" || !Reflect.construct) return false;
		if (Reflect.construct.sham) return false;
		if (typeof Proxy === "function") return true;
		try {
			Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {}));
			return true;
		} catch (e) {
			return false;
		}
	}
	function _getPrototypeOf(o) {
		_getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function _getPrototypeOf(o) {
			return o.__proto__ || Object.getPrototypeOf(o);
		};
		return _getPrototypeOf(o);
	}
	var codes = {};
	var assert;
	var util;
	function createErrorType(code, message, Base) {
		if (!Base) Base = Error;
		function getMessage(arg1, arg2, arg3) {
			if (typeof message === "string") return message;
			else return message(arg1, arg2, arg3);
		}
		codes[code] = /* @__PURE__ */ function(_Base) {
			_inherits(NodeError, _Base);
			var _super = _createSuper(NodeError);
			function NodeError(arg1, arg2, arg3) {
				var _this;
				_classCallCheck(this, NodeError);
				_this = _super.call(this, getMessage(arg1, arg2, arg3));
				_this.code = code;
				return _this;
			}
			return _createClass(NodeError);
		}(Base);
	}
	function oneOf(expected, thing) {
		if (Array.isArray(expected)) {
			var len = expected.length;
			expected = expected.map(function(i) {
				return String(i);
			});
			if (len > 2) return "one of ".concat(thing, " ").concat(expected.slice(0, len - 1).join(", "), ", or ") + expected[len - 1];
			else if (len === 2) return "one of ".concat(thing, " ").concat(expected[0], " or ").concat(expected[1]);
			else return "of ".concat(thing, " ").concat(expected[0]);
		} else return "of ".concat(thing, " ").concat(String(expected));
	}
	function startsWith(str, search, pos) {
		return str.substr(!pos || pos < 0 ? 0 : +pos, search.length) === search;
	}
	function endsWith(str, search, this_len) {
		if (this_len === void 0 || this_len > str.length) this_len = str.length;
		return str.substring(this_len - search.length, this_len) === search;
	}
	function includes(str, search, start) {
		if (typeof start !== "number") start = 0;
		if (start + search.length > str.length) return false;
		else return str.indexOf(search, start) !== -1;
	}
	createErrorType("ERR_AMBIGUOUS_ARGUMENT", "The \"%s\" argument is ambiguous. %s", TypeError);
	createErrorType("ERR_INVALID_ARG_TYPE", function(name, expected, actual) {
		if (assert === void 0) assert = require_assert();
		assert(typeof name === "string", "'name' must be a string");
		var determiner;
		if (typeof expected === "string" && startsWith(expected, "not ")) {
			determiner = "must not be";
			expected = expected.replace(/^not /, "");
		} else determiner = "must be";
		var msg;
		if (endsWith(name, " argument")) msg = "The ".concat(name, " ").concat(determiner, " ").concat(oneOf(expected, "type"));
		else {
			var type = includes(name, ".") ? "property" : "argument";
			msg = "The \"".concat(name, "\" ").concat(type, " ").concat(determiner, " ").concat(oneOf(expected, "type"));
		}
		msg += ". Received type ".concat(_typeof(actual));
		return msg;
	}, TypeError);
	createErrorType("ERR_INVALID_ARG_VALUE", function(name, value) {
		var reason = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : "is invalid";
		if (util === void 0) util = require__require_as_import_util();
		var inspected = util.inspect(value);
		if (inspected.length > 128) inspected = "".concat(inspected.slice(0, 128), "...");
		return "The argument '".concat(name, "' ").concat(reason, ". Received ").concat(inspected);
	}, TypeError, RangeError);
	createErrorType("ERR_INVALID_RETURN_VALUE", function(input, name, value) {
		var type;
		if (value && value.constructor && value.constructor.name) type = "instance of ".concat(value.constructor.name);
		else type = "type ".concat(_typeof(value));
		return "Expected ".concat(input, " to be returned from the \"").concat(name, "\"") + " function but got ".concat(type, ".");
	}, TypeError);
	createErrorType("ERR_MISSING_ARGS", function() {
		for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) args[_key] = arguments[_key];
		if (assert === void 0) assert = require_assert();
		assert(args.length > 0, "At least one arg needs to be specified");
		var msg = "The ";
		var len = args.length;
		args = args.map(function(a) {
			return "\"".concat(a, "\"");
		});
		switch (len) {
			case 1:
				msg += "".concat(args[0], " argument");
				break;
			case 2:
				msg += "".concat(args[0], " and ").concat(args[1], " arguments");
				break;
			default:
				msg += args.slice(0, len - 1).join(", ");
				msg += ", and ".concat(args[len - 1], " arguments");
		}
		return "".concat(msg, " must be specified");
	}, TypeError);
	module.exports.codes = codes;
}));
//#endregion
//#region ../../node_modules/.pnpm/assert@2.1.0/node_modules/assert/build/internal/assert/assertion_error.js
var require_assertion_error = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	function ownKeys(e, r) {
		var t = Object.keys(e);
		if (Object.getOwnPropertySymbols) {
			var o = Object.getOwnPropertySymbols(e);
			r && (o = o.filter(function(r) {
				return Object.getOwnPropertyDescriptor(e, r).enumerable;
			})), t.push.apply(t, o);
		}
		return t;
	}
	function _objectSpread(e) {
		for (var r = 1; r < arguments.length; r++) {
			var t = null != arguments[r] ? arguments[r] : {};
			r % 2 ? ownKeys(Object(t), !0).forEach(function(r) {
				_defineProperty(e, r, t[r]);
			}) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function(r) {
				Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r));
			});
		}
		return e;
	}
	function _defineProperty(obj, key, value) {
		key = _toPropertyKey(key);
		if (key in obj) Object.defineProperty(obj, key, {
			value,
			enumerable: true,
			configurable: true,
			writable: true
		});
		else obj[key] = value;
		return obj;
	}
	function _classCallCheck(instance, Constructor) {
		if (!(instance instanceof Constructor)) throw new TypeError("Cannot call a class as a function");
	}
	function _defineProperties(target, props) {
		for (var i = 0; i < props.length; i++) {
			var descriptor = props[i];
			descriptor.enumerable = descriptor.enumerable || false;
			descriptor.configurable = true;
			if ("value" in descriptor) descriptor.writable = true;
			Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor);
		}
	}
	function _createClass(Constructor, protoProps, staticProps) {
		if (protoProps) _defineProperties(Constructor.prototype, protoProps);
		if (staticProps) _defineProperties(Constructor, staticProps);
		Object.defineProperty(Constructor, "prototype", { writable: false });
		return Constructor;
	}
	function _toPropertyKey(arg) {
		var key = _toPrimitive(arg, "string");
		return _typeof(key) === "symbol" ? key : String(key);
	}
	function _toPrimitive(input, hint) {
		if (_typeof(input) !== "object" || input === null) return input;
		var prim = input[Symbol.toPrimitive];
		if (prim !== void 0) {
			var res = prim.call(input, hint || "default");
			if (_typeof(res) !== "object") return res;
			throw new TypeError("@@toPrimitive must return a primitive value.");
		}
		return (hint === "string" ? String : Number)(input);
	}
	function _inherits(subClass, superClass) {
		if (typeof superClass !== "function" && superClass !== null) throw new TypeError("Super expression must either be null or a function");
		subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: {
			value: subClass,
			writable: true,
			configurable: true
		} });
		Object.defineProperty(subClass, "prototype", { writable: false });
		if (superClass) _setPrototypeOf(subClass, superClass);
	}
	function _createSuper(Derived) {
		var hasNativeReflectConstruct = _isNativeReflectConstruct();
		return function _createSuperInternal() {
			var Super = _getPrototypeOf(Derived), result;
			if (hasNativeReflectConstruct) {
				var NewTarget = _getPrototypeOf(this).constructor;
				result = Reflect.construct(Super, arguments, NewTarget);
			} else result = Super.apply(this, arguments);
			return _possibleConstructorReturn(this, result);
		};
	}
	function _possibleConstructorReturn(self, call) {
		if (call && (_typeof(call) === "object" || typeof call === "function")) return call;
		else if (call !== void 0) throw new TypeError("Derived constructors may only return object or undefined");
		return _assertThisInitialized(self);
	}
	function _assertThisInitialized(self) {
		if (self === void 0) throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
		return self;
	}
	function _wrapNativeSuper(Class) {
		var _cache = typeof Map === "function" ? /* @__PURE__ */ new Map() : void 0;
		_wrapNativeSuper = function _wrapNativeSuper(Class) {
			if (Class === null || !_isNativeFunction(Class)) return Class;
			if (typeof Class !== "function") throw new TypeError("Super expression must either be null or a function");
			if (typeof _cache !== "undefined") {
				if (_cache.has(Class)) return _cache.get(Class);
				_cache.set(Class, Wrapper);
			}
			function Wrapper() {
				return _construct(Class, arguments, _getPrototypeOf(this).constructor);
			}
			Wrapper.prototype = Object.create(Class.prototype, { constructor: {
				value: Wrapper,
				enumerable: false,
				writable: true,
				configurable: true
			} });
			return _setPrototypeOf(Wrapper, Class);
		};
		return _wrapNativeSuper(Class);
	}
	function _construct(Parent, args, Class) {
		if (_isNativeReflectConstruct()) _construct = Reflect.construct.bind();
		else _construct = function _construct(Parent, args, Class) {
			var a = [null];
			a.push.apply(a, args);
			var instance = new (Function.bind.apply(Parent, a))();
			if (Class) _setPrototypeOf(instance, Class.prototype);
			return instance;
		};
		return _construct.apply(null, arguments);
	}
	function _isNativeReflectConstruct() {
		if (typeof Reflect === "undefined" || !Reflect.construct) return false;
		if (Reflect.construct.sham) return false;
		if (typeof Proxy === "function") return true;
		try {
			Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {}));
			return true;
		} catch (e) {
			return false;
		}
	}
	function _isNativeFunction(fn) {
		return Function.toString.call(fn).indexOf("[native code]") !== -1;
	}
	function _setPrototypeOf(o, p) {
		_setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function _setPrototypeOf(o, p) {
			o.__proto__ = p;
			return o;
		};
		return _setPrototypeOf(o, p);
	}
	function _getPrototypeOf(o) {
		_getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function _getPrototypeOf(o) {
			return o.__proto__ || Object.getPrototypeOf(o);
		};
		return _getPrototypeOf(o);
	}
	function _typeof(o) {
		"@babel/helpers - typeof";
		return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
			return typeof o;
		} : function(o) {
			return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
		}, _typeof(o);
	}
	var inspect = require__require_as_import_util().inspect;
	var ERR_INVALID_ARG_TYPE = require_errors().codes.ERR_INVALID_ARG_TYPE;
	function endsWith(str, search, this_len) {
		if (this_len === void 0 || this_len > str.length) this_len = str.length;
		return str.substring(this_len - search.length, this_len) === search;
	}
	function repeat(str, count) {
		count = Math.floor(count);
		if (str.length == 0 || count == 0) return "";
		var maxCount = str.length * count;
		count = Math.floor(Math.log(count) / Math.log(2));
		while (count) {
			str += str;
			count--;
		}
		str += str.substring(0, maxCount - str.length);
		return str;
	}
	var blue = "";
	var green = "";
	var red = "";
	var white = "";
	var kReadableOperator = {
		deepStrictEqual: "Expected values to be strictly deep-equal:",
		strictEqual: "Expected values to be strictly equal:",
		strictEqualObject: "Expected \"actual\" to be reference-equal to \"expected\":",
		deepEqual: "Expected values to be loosely deep-equal:",
		equal: "Expected values to be loosely equal:",
		notDeepStrictEqual: "Expected \"actual\" not to be strictly deep-equal to:",
		notStrictEqual: "Expected \"actual\" to be strictly unequal to:",
		notStrictEqualObject: "Expected \"actual\" not to be reference-equal to \"expected\":",
		notDeepEqual: "Expected \"actual\" not to be loosely deep-equal to:",
		notEqual: "Expected \"actual\" to be loosely unequal to:",
		notIdentical: "Values identical but not reference-equal:"
	};
	var kMaxShortLength = 10;
	function copyError(source) {
		var keys = Object.keys(source);
		var target = Object.create(Object.getPrototypeOf(source));
		keys.forEach(function(key) {
			target[key] = source[key];
		});
		Object.defineProperty(target, "message", { value: source.message });
		return target;
	}
	function inspectValue(val) {
		return inspect(val, {
			compact: false,
			customInspect: false,
			depth: 1e3,
			maxArrayLength: Infinity,
			showHidden: false,
			breakLength: Infinity,
			showProxy: false,
			sorted: true,
			getters: true
		});
	}
	function createErrDiff(actual, expected, operator) {
		var other = "";
		var res = "";
		var lastPos = 0;
		var end = "";
		var skipped = false;
		var actualInspected = inspectValue(actual);
		var actualLines = actualInspected.split("\n");
		var expectedLines = inspectValue(expected).split("\n");
		var i = 0;
		var indicator = "";
		if (operator === "strictEqual" && _typeof(actual) === "object" && _typeof(expected) === "object" && actual !== null && expected !== null) operator = "strictEqualObject";
		if (actualLines.length === 1 && expectedLines.length === 1 && actualLines[0] !== expectedLines[0]) {
			var inputLength = actualLines[0].length + expectedLines[0].length;
			if (inputLength <= kMaxShortLength) {
				if ((_typeof(actual) !== "object" || actual === null) && (_typeof(expected) !== "object" || expected === null) && (actual !== 0 || expected !== 0)) return "".concat(kReadableOperator[operator], "\n\n") + "".concat(actualLines[0], " !== ").concat(expectedLines[0], "\n");
			} else if (operator !== "strictEqualObject") {
				if (inputLength < (process.stderr && process.stderr.isTTY ? process.stderr.columns : 80)) {
					while (actualLines[0][i] === expectedLines[0][i]) i++;
					if (i > 2) {
						indicator = "\n  ".concat(repeat(" ", i), "^");
						i = 0;
					}
				}
			}
		}
		var a = actualLines[actualLines.length - 1];
		var b = expectedLines[expectedLines.length - 1];
		while (a === b) {
			if (i++ < 2) end = "\n  ".concat(a).concat(end);
			else other = a;
			actualLines.pop();
			expectedLines.pop();
			if (actualLines.length === 0 || expectedLines.length === 0) break;
			a = actualLines[actualLines.length - 1];
			b = expectedLines[expectedLines.length - 1];
		}
		var maxLines = Math.max(actualLines.length, expectedLines.length);
		if (maxLines === 0) {
			var _actualLines = actualInspected.split("\n");
			if (_actualLines.length > 30) {
				_actualLines[26] = "".concat(blue, "...").concat(white);
				while (_actualLines.length > 27) _actualLines.pop();
			}
			return "".concat(kReadableOperator.notIdentical, "\n\n").concat(_actualLines.join("\n"), "\n");
		}
		if (i > 3) {
			end = "\n".concat(blue, "...").concat(white).concat(end);
			skipped = true;
		}
		if (other !== "") {
			end = "\n  ".concat(other).concat(end);
			other = "";
		}
		var printedLines = 0;
		var msg = kReadableOperator[operator] + "\n".concat(green, "+ actual").concat(white, " ").concat(red, "- expected").concat(white);
		var skippedMsg = " ".concat(blue, "...").concat(white, " Lines skipped");
		for (i = 0; i < maxLines; i++) {
			var cur = i - lastPos;
			if (actualLines.length < i + 1) {
				if (cur > 1 && i > 2) {
					if (cur > 4) {
						res += "\n".concat(blue, "...").concat(white);
						skipped = true;
					} else if (cur > 3) {
						res += "\n  ".concat(expectedLines[i - 2]);
						printedLines++;
					}
					res += "\n  ".concat(expectedLines[i - 1]);
					printedLines++;
				}
				lastPos = i;
				other += "\n".concat(red, "-").concat(white, " ").concat(expectedLines[i]);
				printedLines++;
			} else if (expectedLines.length < i + 1) {
				if (cur > 1 && i > 2) {
					if (cur > 4) {
						res += "\n".concat(blue, "...").concat(white);
						skipped = true;
					} else if (cur > 3) {
						res += "\n  ".concat(actualLines[i - 2]);
						printedLines++;
					}
					res += "\n  ".concat(actualLines[i - 1]);
					printedLines++;
				}
				lastPos = i;
				res += "\n".concat(green, "+").concat(white, " ").concat(actualLines[i]);
				printedLines++;
			} else {
				var expectedLine = expectedLines[i];
				var actualLine = actualLines[i];
				var divergingLines = actualLine !== expectedLine && (!endsWith(actualLine, ",") || actualLine.slice(0, -1) !== expectedLine);
				if (divergingLines && endsWith(expectedLine, ",") && expectedLine.slice(0, -1) === actualLine) {
					divergingLines = false;
					actualLine += ",";
				}
				if (divergingLines) {
					if (cur > 1 && i > 2) {
						if (cur > 4) {
							res += "\n".concat(blue, "...").concat(white);
							skipped = true;
						} else if (cur > 3) {
							res += "\n  ".concat(actualLines[i - 2]);
							printedLines++;
						}
						res += "\n  ".concat(actualLines[i - 1]);
						printedLines++;
					}
					lastPos = i;
					res += "\n".concat(green, "+").concat(white, " ").concat(actualLine);
					other += "\n".concat(red, "-").concat(white, " ").concat(expectedLine);
					printedLines += 2;
				} else {
					res += other;
					other = "";
					if (cur === 1 || i === 0) {
						res += "\n  ".concat(actualLine);
						printedLines++;
					}
				}
			}
			if (printedLines > 20 && i < maxLines - 2) return "".concat(msg).concat(skippedMsg, "\n").concat(res, "\n").concat(blue, "...").concat(white).concat(other, "\n") + "".concat(blue, "...").concat(white);
		}
		return "".concat(msg).concat(skipped ? skippedMsg : "", "\n").concat(res).concat(other).concat(end).concat(indicator);
	}
	module.exports = /* @__PURE__ */ function(_Error, _inspect$custom) {
		_inherits(AssertionError, _Error);
		var _super = _createSuper(AssertionError);
		function AssertionError(options) {
			var _this;
			_classCallCheck(this, AssertionError);
			if (_typeof(options) !== "object" || options === null) throw new ERR_INVALID_ARG_TYPE("options", "Object", options);
			var message = options.message, operator = options.operator, stackStartFn = options.stackStartFn;
			var actual = options.actual, expected = options.expected;
			var limit = Error.stackTraceLimit;
			Error.stackTraceLimit = 0;
			if (message != null) _this = _super.call(this, String(message));
			else {
				if (process.stderr && process.stderr.isTTY) {
					if (process.stderr && process.stderr.getColorDepth && process.stderr.getColorDepth() !== 1) {
						blue = "\x1B[34m";
						green = "\x1B[32m";
						white = "\x1B[39m";
						red = "\x1B[31m";
					} else {
						blue = "";
						green = "";
						white = "";
						red = "";
					}
				}
				if (_typeof(actual) === "object" && actual !== null && _typeof(expected) === "object" && expected !== null && "stack" in actual && actual instanceof Error && "stack" in expected && expected instanceof Error) {
					actual = copyError(actual);
					expected = copyError(expected);
				}
				if (operator === "deepStrictEqual" || operator === "strictEqual") _this = _super.call(this, createErrDiff(actual, expected, operator));
				else if (operator === "notDeepStrictEqual" || operator === "notStrictEqual") {
					var base = kReadableOperator[operator];
					var res = inspectValue(actual).split("\n");
					if (operator === "notStrictEqual" && _typeof(actual) === "object" && actual !== null) base = kReadableOperator.notStrictEqualObject;
					if (res.length > 30) {
						res[26] = "".concat(blue, "...").concat(white);
						while (res.length > 27) res.pop();
					}
					if (res.length === 1) _this = _super.call(this, "".concat(base, " ").concat(res[0]));
					else _this = _super.call(this, "".concat(base, "\n\n").concat(res.join("\n"), "\n"));
				} else {
					var _res = inspectValue(actual);
					var other = "";
					var knownOperators = kReadableOperator[operator];
					if (operator === "notDeepEqual" || operator === "notEqual") {
						_res = "".concat(kReadableOperator[operator], "\n\n").concat(_res);
						if (_res.length > 1024) _res = "".concat(_res.slice(0, 1021), "...");
					} else {
						other = "".concat(inspectValue(expected));
						if (_res.length > 512) _res = "".concat(_res.slice(0, 509), "...");
						if (other.length > 512) other = "".concat(other.slice(0, 509), "...");
						if (operator === "deepEqual" || operator === "equal") _res = "".concat(knownOperators, "\n\n").concat(_res, "\n\nshould equal\n\n");
						else other = " ".concat(operator, " ").concat(other);
					}
					_this = _super.call(this, "".concat(_res).concat(other));
				}
			}
			Error.stackTraceLimit = limit;
			_this.generatedMessage = !message;
			Object.defineProperty(_assertThisInitialized(_this), "name", {
				value: "AssertionError [ERR_ASSERTION]",
				enumerable: false,
				writable: true,
				configurable: true
			});
			_this.code = "ERR_ASSERTION";
			_this.actual = actual;
			_this.expected = expected;
			_this.operator = operator;
			if (Error.captureStackTrace) Error.captureStackTrace(_assertThisInitialized(_this), stackStartFn);
			_this.stack;
			_this.name = "AssertionError";
			return _possibleConstructorReturn(_this);
		}
		_createClass(AssertionError, [{
			key: "toString",
			value: function toString() {
				return "".concat(this.name, " [").concat(this.code, "]: ").concat(this.message);
			}
		}, {
			key: _inspect$custom,
			value: function value(recurseTimes, ctx) {
				return inspect(this, _objectSpread(_objectSpread({}, ctx), {}, {
					customInspect: false,
					depth: 0
				}));
			}
		}]);
		return AssertionError;
	}(/*#__PURE__*/ _wrapNativeSuper(Error), inspect.custom);
}));
//#endregion
//#region ../../node_modules/.pnpm/object-keys@1.1.1/node_modules/object-keys/isArguments.js
var require_isArguments = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var toStr = Object.prototype.toString;
	module.exports = function isArguments(value) {
		var str = toStr.call(value);
		var isArgs = str === "[object Arguments]";
		if (!isArgs) isArgs = str !== "[object Array]" && value !== null && typeof value === "object" && typeof value.length === "number" && value.length >= 0 && toStr.call(value.callee) === "[object Function]";
		return isArgs;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/object-keys@1.1.1/node_modules/object-keys/implementation.js
var require_implementation$4 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var keysShim;
	if (!Object.keys) {
		var has = Object.prototype.hasOwnProperty;
		var toStr = Object.prototype.toString;
		var isArgs = require_isArguments();
		var isEnumerable = Object.prototype.propertyIsEnumerable;
		var hasDontEnumBug = !isEnumerable.call({ toString: null }, "toString");
		var hasProtoEnumBug = isEnumerable.call(function() {}, "prototype");
		var dontEnums = [
			"toString",
			"toLocaleString",
			"valueOf",
			"hasOwnProperty",
			"isPrototypeOf",
			"propertyIsEnumerable",
			"constructor"
		];
		var equalsConstructorPrototype = function(o) {
			var ctor = o.constructor;
			return ctor && ctor.prototype === o;
		};
		var excludedKeys = {
			$applicationCache: true,
			$console: true,
			$external: true,
			$frame: true,
			$frameElement: true,
			$frames: true,
			$innerHeight: true,
			$innerWidth: true,
			$onmozfullscreenchange: true,
			$onmozfullscreenerror: true,
			$outerHeight: true,
			$outerWidth: true,
			$pageXOffset: true,
			$pageYOffset: true,
			$parent: true,
			$scrollLeft: true,
			$scrollTop: true,
			$scrollX: true,
			$scrollY: true,
			$self: true,
			$webkitIndexedDB: true,
			$webkitStorageInfo: true,
			$window: true
		};
		var hasAutomationEqualityBug = function() {
			if (typeof window === "undefined") return false;
			for (var k in window) try {
				if (!excludedKeys["$" + k] && has.call(window, k) && window[k] !== null && typeof window[k] === "object") try {
					equalsConstructorPrototype(window[k]);
				} catch (e) {
					return true;
				}
			} catch (e) {
				return true;
			}
			return false;
		}();
		var equalsConstructorPrototypeIfNotBuggy = function(o) {
			if (typeof window === "undefined" || !hasAutomationEqualityBug) return equalsConstructorPrototype(o);
			try {
				return equalsConstructorPrototype(o);
			} catch (e) {
				return false;
			}
		};
		keysShim = function keys(object) {
			var isObject = object !== null && typeof object === "object";
			var isFunction = toStr.call(object) === "[object Function]";
			var isArguments = isArgs(object);
			var isString = isObject && toStr.call(object) === "[object String]";
			var theKeys = [];
			if (!isObject && !isFunction && !isArguments) throw new TypeError("Object.keys called on a non-object");
			var skipProto = hasProtoEnumBug && isFunction;
			if (isString && object.length > 0 && !has.call(object, 0)) for (var i = 0; i < object.length; ++i) theKeys.push(String(i));
			if (isArguments && object.length > 0) for (var j = 0; j < object.length; ++j) theKeys.push(String(j));
			else for (var name in object) if (!(skipProto && name === "prototype") && has.call(object, name)) theKeys.push(String(name));
			if (hasDontEnumBug) {
				var skipConstructor = equalsConstructorPrototypeIfNotBuggy(object);
				for (var k = 0; k < dontEnums.length; ++k) if (!(skipConstructor && dontEnums[k] === "constructor") && has.call(object, dontEnums[k])) theKeys.push(dontEnums[k]);
			}
			return theKeys;
		};
	}
	module.exports = keysShim;
}));
//#endregion
//#region ../../node_modules/.pnpm/object-keys@1.1.1/node_modules/object-keys/index.js
var require_object_keys = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var slice = Array.prototype.slice;
	var isArgs = require_isArguments();
	var origKeys = Object.keys;
	var keysShim = origKeys ? function keys(o) {
		return origKeys(o);
	} : require_implementation$4();
	var originalKeys = Object.keys;
	keysShim.shim = function shimObjectKeys() {
		if (Object.keys) {
			if (!function() {
				var args = Object.keys(arguments);
				return args && args.length === arguments.length;
			}(1, 2)) Object.keys = function keys(object) {
				if (isArgs(object)) return originalKeys(slice.call(object));
				return originalKeys(object);
			};
		} else Object.keys = keysShim;
		return Object.keys || keysShim;
	};
	module.exports = keysShim;
}));
//#endregion
//#region ../../node_modules/.pnpm/has-symbols@1.1.0/node_modules/has-symbols/shams.js
var require_shams = /* @__PURE__ */ __commonJSMin(((exports, module) => {
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
	var hasSymbolSham = require_shams();
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
var require_implementation$3 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
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
	var implementation = require_implementation$3();
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
//#region ../../node_modules/.pnpm/object.assign@4.1.7/node_modules/object.assign/implementation.js
var require_implementation$2 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var objectKeys = require_object_keys();
	var hasSymbols = require_shams()();
	var callBound = require_call_bound();
	var $Object = require_es_object_atoms();
	var $push = callBound("Array.prototype.push");
	var $propIsEnumerable = callBound("Object.prototype.propertyIsEnumerable");
	var originalGetSymbols = hasSymbols ? $Object.getOwnPropertySymbols : null;
	module.exports = function assign(target, source1) {
		if (target == null) throw new TypeError("target must be an object");
		var to = $Object(target);
		if (arguments.length === 1) return to;
		for (var s = 1; s < arguments.length; ++s) {
			var from = $Object(arguments[s]);
			var keys = objectKeys(from);
			var getSymbols = hasSymbols && ($Object.getOwnPropertySymbols || originalGetSymbols);
			if (getSymbols) {
				var syms = getSymbols(from);
				for (var j = 0; j < syms.length; ++j) {
					var key = syms[j];
					if ($propIsEnumerable(from, key)) $push(keys, key);
				}
			}
			for (var i = 0; i < keys.length; ++i) {
				var nextKey = keys[i];
				if ($propIsEnumerable(from, nextKey)) to[nextKey] = from[nextKey];
			}
		}
		return to;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/object.assign@4.1.7/node_modules/object.assign/polyfill.js
var require_polyfill$2 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var implementation = require_implementation$2();
	var lacksProperEnumerationOrder = function() {
		if (!Object.assign) return false;
		var str = "abcdefghijklmnopqrst";
		var letters = str.split("");
		var map = {};
		for (var i = 0; i < letters.length; ++i) map[letters[i]] = letters[i];
		var obj = Object.assign({}, map);
		var actual = "";
		for (var k in obj) actual += k;
		return str !== actual;
	};
	var assignHasPendingExceptions = function() {
		if (!Object.assign || !Object.preventExtensions) return false;
		var thrower = Object.preventExtensions({ 1: 2 });
		try {
			Object.assign(thrower, "xy");
		} catch (e) {
			return thrower[1] === "y";
		}
		return false;
	};
	module.exports = function getPolyfill() {
		if (!Object.assign) return implementation;
		if (lacksProperEnumerationOrder()) return implementation;
		if (assignHasPendingExceptions()) return implementation;
		return Object.assign;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/object-is@1.1.6/node_modules/object-is/implementation.js
var require_implementation$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var numberIsNaN = function(value) {
		return value !== value;
	};
	module.exports = function is(a, b) {
		if (a === 0 && b === 0) return 1 / a === 1 / b;
		if (a === b) return true;
		if (numberIsNaN(a) && numberIsNaN(b)) return true;
		return false;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/object-is@1.1.6/node_modules/object-is/polyfill.js
var require_polyfill$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var implementation = require_implementation$1();
	module.exports = function getPolyfill() {
		return typeof Object.is === "function" ? Object.is : implementation;
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
//#region ../../node_modules/.pnpm/call-bind@1.0.9/node_modules/call-bind/callBound.js
var require_callBound = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var GetIntrinsic = require_get_intrinsic();
	var callBind = require_call_bind();
	var $indexOf = callBind(GetIntrinsic("String.prototype.indexOf"));
	module.exports = function callBoundIntrinsic(name, allowMissing) {
		var intrinsic = GetIntrinsic(name, !!allowMissing);
		if (typeof intrinsic === "function" && $indexOf(name, ".prototype.") > -1) return callBind(intrinsic);
		return intrinsic;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/define-properties@1.2.1/node_modules/define-properties/index.js
var require_define_properties = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var keys = require_object_keys();
	var hasSymbols = typeof Symbol === "function" && typeof Symbol("foo") === "symbol";
	var toStr = Object.prototype.toString;
	var concat = Array.prototype.concat;
	var defineDataProperty = require_define_data_property();
	var isFunction = function(fn) {
		return typeof fn === "function" && toStr.call(fn) === "[object Function]";
	};
	var supportsDescriptors = require_has_property_descriptors()();
	var defineProperty = function(object, name, value, predicate) {
		if (name in object) {
			if (predicate === true) {
				if (object[name] === value) return;
			} else if (!isFunction(predicate) || !predicate()) return;
		}
		if (supportsDescriptors) defineDataProperty(object, name, value, true);
		else defineDataProperty(object, name, value);
	};
	var defineProperties = function(object, map) {
		var predicates = arguments.length > 2 ? arguments[2] : {};
		var props = keys(map);
		if (hasSymbols) props = concat.call(props, Object.getOwnPropertySymbols(map));
		for (var i = 0; i < props.length; i += 1) defineProperty(object, props[i], map[props[i]], predicates[props[i]]);
	};
	defineProperties.supportsDescriptors = !!supportsDescriptors;
	module.exports = defineProperties;
}));
//#endregion
//#region ../../node_modules/.pnpm/object-is@1.1.6/node_modules/object-is/shim.js
var require_shim$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var getPolyfill = require_polyfill$1();
	var define = require_define_properties();
	module.exports = function shimObjectIs() {
		var polyfill = getPolyfill();
		define(Object, { is: polyfill }, { is: function testObjectIs() {
			return Object.is !== polyfill;
		} });
		return polyfill;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/object-is@1.1.6/node_modules/object-is/index.js
var require_object_is = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var define = require_define_properties();
	var callBind = require_call_bind();
	var implementation = require_implementation$1();
	var getPolyfill = require_polyfill$1();
	var shim = require_shim$1();
	var polyfill = callBind(getPolyfill(), Object);
	define(polyfill, {
		getPolyfill,
		implementation,
		shim
	});
	module.exports = polyfill;
}));
//#endregion
//#region ../../node_modules/.pnpm/is-nan@1.3.2/node_modules/is-nan/implementation.js
var require_implementation = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = function isNaN(value) {
		return value !== value;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/is-nan@1.3.2/node_modules/is-nan/polyfill.js
var require_polyfill = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var implementation = require_implementation();
	module.exports = function getPolyfill() {
		if (Number.isNaN && !Number.isNaN("a")) return Number.isNaN;
		return implementation;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/is-nan@1.3.2/node_modules/is-nan/shim.js
var require_shim = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var define = require_define_properties();
	var getPolyfill = require_polyfill();
	module.exports = function shimNumberIsNaN() {
		var polyfill = getPolyfill();
		define(Number, { isNaN: polyfill }, { isNaN: function testIsNaN() {
			return Number.isNaN !== polyfill;
		} });
		return polyfill;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/is-nan@1.3.2/node_modules/is-nan/index.js
var require_is_nan = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var callBind = require_call_bind();
	var define = require_define_properties();
	var implementation = require_implementation();
	var getPolyfill = require_polyfill();
	var shim = require_shim();
	var polyfill = callBind(getPolyfill(), Number);
	define(polyfill, {
		getPolyfill,
		implementation,
		shim
	});
	module.exports = polyfill;
}));
//#endregion
//#region ../../node_modules/.pnpm/assert@2.1.0/node_modules/assert/build/internal/util/comparisons.js
var require_comparisons = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	function _slicedToArray(arr, i) {
		return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _unsupportedIterableToArray(arr, i) || _nonIterableRest();
	}
	function _nonIterableRest() {
		throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
	}
	function _unsupportedIterableToArray(o, minLen) {
		if (!o) return;
		if (typeof o === "string") return _arrayLikeToArray(o, minLen);
		var n = Object.prototype.toString.call(o).slice(8, -1);
		if (n === "Object" && o.constructor) n = o.constructor.name;
		if (n === "Map" || n === "Set") return Array.from(o);
		if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen);
	}
	function _arrayLikeToArray(arr, len) {
		if (len == null || len > arr.length) len = arr.length;
		for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i];
		return arr2;
	}
	function _iterableToArrayLimit(r, l) {
		var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"];
		if (null != t) {
			var e, n, i, u, a = [], f = !0, o = !1;
			try {
				if (i = (t = t.call(r)).next, 0 === l) {
					if (Object(t) !== t) return;
					f = !1;
				} else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0);
			} catch (r) {
				o = !0, n = r;
			} finally {
				try {
					if (!f && null != t.return && (u = t.return(), Object(u) !== u)) return;
				} finally {
					if (o) throw n;
				}
			}
			return a;
		}
	}
	function _arrayWithHoles(arr) {
		if (Array.isArray(arr)) return arr;
	}
	function _typeof(o) {
		"@babel/helpers - typeof";
		return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
			return typeof o;
		} : function(o) {
			return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
		}, _typeof(o);
	}
	var regexFlagsSupported = /a/g.flags !== void 0;
	var arrayFromSet = function arrayFromSet(set) {
		var array = [];
		set.forEach(function(value) {
			return array.push(value);
		});
		return array;
	};
	var arrayFromMap = function arrayFromMap(map) {
		var array = [];
		map.forEach(function(value, key) {
			return array.push([key, value]);
		});
		return array;
	};
	var objectIs = Object.is ? Object.is : require_object_is();
	var objectGetOwnPropertySymbols = Object.getOwnPropertySymbols ? Object.getOwnPropertySymbols : function() {
		return [];
	};
	var numberIsNaN = Number.isNaN ? Number.isNaN : require_is_nan();
	function uncurryThis(f) {
		return f.call.bind(f);
	}
	var hasOwnProperty = uncurryThis(Object.prototype.hasOwnProperty);
	var propertyIsEnumerable = uncurryThis(Object.prototype.propertyIsEnumerable);
	var objectToString = uncurryThis(Object.prototype.toString);
	var _require$types = require__require_as_import_util().types;
	var isAnyArrayBuffer = _require$types.isAnyArrayBuffer;
	var isArrayBufferView = _require$types.isArrayBufferView;
	var isDate = _require$types.isDate;
	var isMap = _require$types.isMap;
	var isRegExp = _require$types.isRegExp;
	var isSet = _require$types.isSet;
	var isNativeError = _require$types.isNativeError;
	var isBoxedPrimitive = _require$types.isBoxedPrimitive;
	var isNumberObject = _require$types.isNumberObject;
	var isStringObject = _require$types.isStringObject;
	var isBooleanObject = _require$types.isBooleanObject;
	var isBigIntObject = _require$types.isBigIntObject;
	var isSymbolObject = _require$types.isSymbolObject;
	var isFloat32Array = _require$types.isFloat32Array;
	var isFloat64Array = _require$types.isFloat64Array;
	function isNonIndex(key) {
		if (key.length === 0 || key.length > 10) return true;
		for (var i = 0; i < key.length; i++) {
			var code = key.charCodeAt(i);
			if (code < 48 || code > 57) return true;
		}
		return key.length === 10 && key >= Math.pow(2, 32);
	}
	function getOwnNonIndexProperties(value) {
		return Object.keys(value).filter(isNonIndex).concat(objectGetOwnPropertySymbols(value).filter(Object.prototype.propertyIsEnumerable.bind(value)));
	}
	function compare(a, b) {
		if (a === b) return 0;
		var x = a.length;
		var y = b.length;
		for (var i = 0, len = Math.min(x, y); i < len; ++i) if (a[i] !== b[i]) {
			x = a[i];
			y = b[i];
			break;
		}
		if (x < y) return -1;
		if (y < x) return 1;
		return 0;
	}
	var ONLY_ENUMERABLE = void 0;
	var kStrict = true;
	var kLoose = false;
	var kNoIterator = 0;
	var kIsArray = 1;
	var kIsSet = 2;
	var kIsMap = 3;
	function areSimilarRegExps(a, b) {
		return regexFlagsSupported ? a.source === b.source && a.flags === b.flags : RegExp.prototype.toString.call(a) === RegExp.prototype.toString.call(b);
	}
	function areSimilarFloatArrays(a, b) {
		if (a.byteLength !== b.byteLength) return false;
		for (var offset = 0; offset < a.byteLength; offset++) if (a[offset] !== b[offset]) return false;
		return true;
	}
	function areSimilarTypedArrays(a, b) {
		if (a.byteLength !== b.byteLength) return false;
		return compare(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), new Uint8Array(b.buffer, b.byteOffset, b.byteLength)) === 0;
	}
	function areEqualArrayBuffers(buf1, buf2) {
		return buf1.byteLength === buf2.byteLength && compare(new Uint8Array(buf1), new Uint8Array(buf2)) === 0;
	}
	function isEqualBoxedPrimitive(val1, val2) {
		if (isNumberObject(val1)) return isNumberObject(val2) && objectIs(Number.prototype.valueOf.call(val1), Number.prototype.valueOf.call(val2));
		if (isStringObject(val1)) return isStringObject(val2) && String.prototype.valueOf.call(val1) === String.prototype.valueOf.call(val2);
		if (isBooleanObject(val1)) return isBooleanObject(val2) && Boolean.prototype.valueOf.call(val1) === Boolean.prototype.valueOf.call(val2);
		if (isBigIntObject(val1)) return isBigIntObject(val2) && BigInt.prototype.valueOf.call(val1) === BigInt.prototype.valueOf.call(val2);
		return isSymbolObject(val2) && Symbol.prototype.valueOf.call(val1) === Symbol.prototype.valueOf.call(val2);
	}
	function innerDeepEqual(val1, val2, strict, memos) {
		if (val1 === val2) {
			if (val1 !== 0) return true;
			return strict ? objectIs(val1, val2) : true;
		}
		if (strict) {
			if (_typeof(val1) !== "object") return typeof val1 === "number" && numberIsNaN(val1) && numberIsNaN(val2);
			if (_typeof(val2) !== "object" || val1 === null || val2 === null) return false;
			if (Object.getPrototypeOf(val1) !== Object.getPrototypeOf(val2)) return false;
		} else {
			if (val1 === null || _typeof(val1) !== "object") {
				if (val2 === null || _typeof(val2) !== "object") return val1 == val2;
				return false;
			}
			if (val2 === null || _typeof(val2) !== "object") return false;
		}
		var val1Tag = objectToString(val1);
		if (val1Tag !== objectToString(val2)) return false;
		if (Array.isArray(val1)) {
			if (val1.length !== val2.length) return false;
			var keys1 = getOwnNonIndexProperties(val1, ONLY_ENUMERABLE);
			var keys2 = getOwnNonIndexProperties(val2, ONLY_ENUMERABLE);
			if (keys1.length !== keys2.length) return false;
			return keyCheck(val1, val2, strict, memos, kIsArray, keys1);
		}
		if (val1Tag === "[object Object]") {
			if (!isMap(val1) && isMap(val2) || !isSet(val1) && isSet(val2)) return false;
		}
		if (isDate(val1)) {
			if (!isDate(val2) || Date.prototype.getTime.call(val1) !== Date.prototype.getTime.call(val2)) return false;
		} else if (isRegExp(val1)) {
			if (!isRegExp(val2) || !areSimilarRegExps(val1, val2)) return false;
		} else if (isNativeError(val1) || val1 instanceof Error) {
			if (val1.message !== val2.message || val1.name !== val2.name) return false;
		} else if (isArrayBufferView(val1)) {
			if (!strict && (isFloat32Array(val1) || isFloat64Array(val1))) {
				if (!areSimilarFloatArrays(val1, val2)) return false;
			} else if (!areSimilarTypedArrays(val1, val2)) return false;
			var _keys = getOwnNonIndexProperties(val1, ONLY_ENUMERABLE);
			var _keys2 = getOwnNonIndexProperties(val2, ONLY_ENUMERABLE);
			if (_keys.length !== _keys2.length) return false;
			return keyCheck(val1, val2, strict, memos, kNoIterator, _keys);
		} else if (isSet(val1)) {
			if (!isSet(val2) || val1.size !== val2.size) return false;
			return keyCheck(val1, val2, strict, memos, kIsSet);
		} else if (isMap(val1)) {
			if (!isMap(val2) || val1.size !== val2.size) return false;
			return keyCheck(val1, val2, strict, memos, kIsMap);
		} else if (isAnyArrayBuffer(val1)) {
			if (!areEqualArrayBuffers(val1, val2)) return false;
		} else if (isBoxedPrimitive(val1) && !isEqualBoxedPrimitive(val1, val2)) return false;
		return keyCheck(val1, val2, strict, memos, kNoIterator);
	}
	function getEnumerables(val, keys) {
		return keys.filter(function(k) {
			return propertyIsEnumerable(val, k);
		});
	}
	function keyCheck(val1, val2, strict, memos, iterationType, aKeys) {
		if (arguments.length === 5) {
			aKeys = Object.keys(val1);
			var bKeys = Object.keys(val2);
			if (aKeys.length !== bKeys.length) return false;
		}
		var i = 0;
		for (; i < aKeys.length; i++) if (!hasOwnProperty(val2, aKeys[i])) return false;
		if (strict && arguments.length === 5) {
			var symbolKeysA = objectGetOwnPropertySymbols(val1);
			if (symbolKeysA.length !== 0) {
				var count = 0;
				for (i = 0; i < symbolKeysA.length; i++) {
					var key = symbolKeysA[i];
					if (propertyIsEnumerable(val1, key)) {
						if (!propertyIsEnumerable(val2, key)) return false;
						aKeys.push(key);
						count++;
					} else if (propertyIsEnumerable(val2, key)) return false;
				}
				var symbolKeysB = objectGetOwnPropertySymbols(val2);
				if (symbolKeysA.length !== symbolKeysB.length && getEnumerables(val2, symbolKeysB).length !== count) return false;
			} else {
				var _symbolKeysB = objectGetOwnPropertySymbols(val2);
				if (_symbolKeysB.length !== 0 && getEnumerables(val2, _symbolKeysB).length !== 0) return false;
			}
		}
		if (aKeys.length === 0 && (iterationType === kNoIterator || iterationType === kIsArray && val1.length === 0 || val1.size === 0)) return true;
		if (memos === void 0) memos = {
			val1: /* @__PURE__ */ new Map(),
			val2: /* @__PURE__ */ new Map(),
			position: 0
		};
		else {
			var val2MemoA = memos.val1.get(val1);
			if (val2MemoA !== void 0) {
				var val2MemoB = memos.val2.get(val2);
				if (val2MemoB !== void 0) return val2MemoA === val2MemoB;
			}
			memos.position++;
		}
		memos.val1.set(val1, memos.position);
		memos.val2.set(val2, memos.position);
		var areEq = objEquiv(val1, val2, strict, aKeys, memos, iterationType);
		memos.val1.delete(val1);
		memos.val2.delete(val2);
		return areEq;
	}
	function setHasEqualElement(set, val1, strict, memo) {
		var setValues = arrayFromSet(set);
		for (var i = 0; i < setValues.length; i++) {
			var val2 = setValues[i];
			if (innerDeepEqual(val1, val2, strict, memo)) {
				set.delete(val2);
				return true;
			}
		}
		return false;
	}
	function findLooseMatchingPrimitives(prim) {
		switch (_typeof(prim)) {
			case "undefined": return null;
			case "object": return;
			case "symbol": return false;
			case "string": prim = +prim;
			case "number": if (numberIsNaN(prim)) return false;
		}
		return true;
	}
	function setMightHaveLoosePrim(a, b, prim) {
		var altValue = findLooseMatchingPrimitives(prim);
		if (altValue != null) return altValue;
		return b.has(altValue) && !a.has(altValue);
	}
	function mapMightHaveLoosePrim(a, b, prim, item, memo) {
		var altValue = findLooseMatchingPrimitives(prim);
		if (altValue != null) return altValue;
		var curB = b.get(altValue);
		if (curB === void 0 && !b.has(altValue) || !innerDeepEqual(item, curB, false, memo)) return false;
		return !a.has(altValue) && innerDeepEqual(item, curB, false, memo);
	}
	function setEquiv(a, b, strict, memo) {
		var set = null;
		var aValues = arrayFromSet(a);
		for (var i = 0; i < aValues.length; i++) {
			var val = aValues[i];
			if (_typeof(val) === "object" && val !== null) {
				if (set === null) set = /* @__PURE__ */ new Set();
				set.add(val);
			} else if (!b.has(val)) {
				if (strict) return false;
				if (!setMightHaveLoosePrim(a, b, val)) return false;
				if (set === null) set = /* @__PURE__ */ new Set();
				set.add(val);
			}
		}
		if (set !== null) {
			var bValues = arrayFromSet(b);
			for (var _i = 0; _i < bValues.length; _i++) {
				var _val = bValues[_i];
				if (_typeof(_val) === "object" && _val !== null) {
					if (!setHasEqualElement(set, _val, strict, memo)) return false;
				} else if (!strict && !a.has(_val) && !setHasEqualElement(set, _val, strict, memo)) return false;
			}
			return set.size === 0;
		}
		return true;
	}
	function mapHasEqualEntry(set, map, key1, item1, strict, memo) {
		var setValues = arrayFromSet(set);
		for (var i = 0; i < setValues.length; i++) {
			var key2 = setValues[i];
			if (innerDeepEqual(key1, key2, strict, memo) && innerDeepEqual(item1, map.get(key2), strict, memo)) {
				set.delete(key2);
				return true;
			}
		}
		return false;
	}
	function mapEquiv(a, b, strict, memo) {
		var set = null;
		var aEntries = arrayFromMap(a);
		for (var i = 0; i < aEntries.length; i++) {
			var _aEntries$i = _slicedToArray(aEntries[i], 2), key = _aEntries$i[0], item1 = _aEntries$i[1];
			if (_typeof(key) === "object" && key !== null) {
				if (set === null) set = /* @__PURE__ */ new Set();
				set.add(key);
			} else {
				var item2 = b.get(key);
				if (item2 === void 0 && !b.has(key) || !innerDeepEqual(item1, item2, strict, memo)) {
					if (strict) return false;
					if (!mapMightHaveLoosePrim(a, b, key, item1, memo)) return false;
					if (set === null) set = /* @__PURE__ */ new Set();
					set.add(key);
				}
			}
		}
		if (set !== null) {
			var bEntries = arrayFromMap(b);
			for (var _i2 = 0; _i2 < bEntries.length; _i2++) {
				var _bEntries$_i = _slicedToArray(bEntries[_i2], 2), _key = _bEntries$_i[0], item = _bEntries$_i[1];
				if (_typeof(_key) === "object" && _key !== null) {
					if (!mapHasEqualEntry(set, a, _key, item, strict, memo)) return false;
				} else if (!strict && (!a.has(_key) || !innerDeepEqual(a.get(_key), item, false, memo)) && !mapHasEqualEntry(set, a, _key, item, false, memo)) return false;
			}
			return set.size === 0;
		}
		return true;
	}
	function objEquiv(a, b, strict, keys, memos, iterationType) {
		var i = 0;
		if (iterationType === kIsSet) {
			if (!setEquiv(a, b, strict, memos)) return false;
		} else if (iterationType === kIsMap) {
			if (!mapEquiv(a, b, strict, memos)) return false;
		} else if (iterationType === kIsArray) for (; i < a.length; i++) if (hasOwnProperty(a, i)) {
			if (!hasOwnProperty(b, i) || !innerDeepEqual(a[i], b[i], strict, memos)) return false;
		} else if (hasOwnProperty(b, i)) return false;
		else {
			var keysA = Object.keys(a);
			for (; i < keysA.length; i++) {
				var key = keysA[i];
				if (!hasOwnProperty(b, key) || !innerDeepEqual(a[key], b[key], strict, memos)) return false;
			}
			if (keysA.length !== Object.keys(b).length) return false;
			return true;
		}
		for (i = 0; i < keys.length; i++) {
			var _key2 = keys[i];
			if (!innerDeepEqual(a[_key2], b[_key2], strict, memos)) return false;
		}
		return true;
	}
	function isDeepEqual(val1, val2) {
		return innerDeepEqual(val1, val2, kLoose);
	}
	function isDeepStrictEqual(val1, val2) {
		return innerDeepEqual(val1, val2, kStrict);
	}
	module.exports = {
		isDeepEqual,
		isDeepStrictEqual
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/assert@2.1.0/node_modules/assert/build/assert.js
var require_assert = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	function _typeof(o) {
		"@babel/helpers - typeof";
		return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
			return typeof o;
		} : function(o) {
			return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
		}, _typeof(o);
	}
	function _defineProperties(target, props) {
		for (var i = 0; i < props.length; i++) {
			var descriptor = props[i];
			descriptor.enumerable = descriptor.enumerable || false;
			descriptor.configurable = true;
			if ("value" in descriptor) descriptor.writable = true;
			Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor);
		}
	}
	function _createClass(Constructor, protoProps, staticProps) {
		if (protoProps) _defineProperties(Constructor.prototype, protoProps);
		if (staticProps) _defineProperties(Constructor, staticProps);
		Object.defineProperty(Constructor, "prototype", { writable: false });
		return Constructor;
	}
	function _toPropertyKey(arg) {
		var key = _toPrimitive(arg, "string");
		return _typeof(key) === "symbol" ? key : String(key);
	}
	function _toPrimitive(input, hint) {
		if (_typeof(input) !== "object" || input === null) return input;
		var prim = input[Symbol.toPrimitive];
		if (prim !== void 0) {
			var res = prim.call(input, hint || "default");
			if (_typeof(res) !== "object") return res;
			throw new TypeError("@@toPrimitive must return a primitive value.");
		}
		return (hint === "string" ? String : Number)(input);
	}
	function _classCallCheck(instance, Constructor) {
		if (!(instance instanceof Constructor)) throw new TypeError("Cannot call a class as a function");
	}
	var _require$codes = require_errors().codes;
	var ERR_AMBIGUOUS_ARGUMENT = _require$codes.ERR_AMBIGUOUS_ARGUMENT;
	var ERR_INVALID_ARG_TYPE = _require$codes.ERR_INVALID_ARG_TYPE;
	var ERR_INVALID_ARG_VALUE = _require$codes.ERR_INVALID_ARG_VALUE;
	var ERR_INVALID_RETURN_VALUE = _require$codes.ERR_INVALID_RETURN_VALUE;
	var ERR_MISSING_ARGS = _require$codes.ERR_MISSING_ARGS;
	var AssertionError = require_assertion_error();
	var inspect = require__require_as_import_util().inspect;
	var _require$types = require__require_as_import_util().types;
	var isPromise = _require$types.isPromise;
	var isRegExp = _require$types.isRegExp;
	var objectAssign = require_polyfill$2()();
	var objectIs = require_polyfill$1()();
	var RegExpPrototypeTest = require_callBound()("RegExp.prototype.test");
	var isDeepEqual;
	var isDeepStrictEqual;
	function lazyLoadComparison() {
		var comparison = require_comparisons();
		isDeepEqual = comparison.isDeepEqual;
		isDeepStrictEqual = comparison.isDeepStrictEqual;
	}
	var warned = false;
	var assert = module.exports = ok;
	var NO_EXCEPTION_SENTINEL = {};
	function innerFail(obj) {
		if (obj.message instanceof Error) throw obj.message;
		throw new AssertionError(obj);
	}
	function fail(actual, expected, message, operator, stackStartFn) {
		var argsLen = arguments.length;
		var internalMessage;
		if (argsLen === 0) internalMessage = "Failed";
		else if (argsLen === 1) {
			message = actual;
			actual = void 0;
		} else {
			if (warned === false) {
				warned = true;
				(process.emitWarning ? process.emitWarning : console.warn.bind(console))("assert.fail() with more than one argument is deprecated. Please use assert.strictEqual() instead or only pass a message.", "DeprecationWarning", "DEP0094");
			}
			if (argsLen === 2) operator = "!=";
		}
		if (message instanceof Error) throw message;
		var errArgs = {
			actual,
			expected,
			operator: operator === void 0 ? "fail" : operator,
			stackStartFn: stackStartFn || fail
		};
		if (message !== void 0) errArgs.message = message;
		var err = new AssertionError(errArgs);
		if (internalMessage) {
			err.message = internalMessage;
			err.generatedMessage = true;
		}
		throw err;
	}
	assert.fail = fail;
	assert.AssertionError = AssertionError;
	function innerOk(fn, argLen, value, message) {
		if (!value) {
			var generatedMessage = false;
			if (argLen === 0) {
				generatedMessage = true;
				message = "No value argument passed to `assert.ok()`";
			} else if (message instanceof Error) throw message;
			var err = new AssertionError({
				actual: value,
				expected: true,
				message,
				operator: "==",
				stackStartFn: fn
			});
			err.generatedMessage = generatedMessage;
			throw err;
		}
	}
	function ok() {
		for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) args[_key] = arguments[_key];
		innerOk.apply(void 0, [ok, args.length].concat(args));
	}
	assert.ok = ok;
	assert.equal = function equal(actual, expected, message) {
		if (arguments.length < 2) throw new ERR_MISSING_ARGS("actual", "expected");
		if (actual != expected) innerFail({
			actual,
			expected,
			message,
			operator: "==",
			stackStartFn: equal
		});
	};
	assert.notEqual = function notEqual(actual, expected, message) {
		if (arguments.length < 2) throw new ERR_MISSING_ARGS("actual", "expected");
		if (actual == expected) innerFail({
			actual,
			expected,
			message,
			operator: "!=",
			stackStartFn: notEqual
		});
	};
	assert.deepEqual = function deepEqual(actual, expected, message) {
		if (arguments.length < 2) throw new ERR_MISSING_ARGS("actual", "expected");
		if (isDeepEqual === void 0) lazyLoadComparison();
		if (!isDeepEqual(actual, expected)) innerFail({
			actual,
			expected,
			message,
			operator: "deepEqual",
			stackStartFn: deepEqual
		});
	};
	assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
		if (arguments.length < 2) throw new ERR_MISSING_ARGS("actual", "expected");
		if (isDeepEqual === void 0) lazyLoadComparison();
		if (isDeepEqual(actual, expected)) innerFail({
			actual,
			expected,
			message,
			operator: "notDeepEqual",
			stackStartFn: notDeepEqual
		});
	};
	assert.deepStrictEqual = function deepStrictEqual(actual, expected, message) {
		if (arguments.length < 2) throw new ERR_MISSING_ARGS("actual", "expected");
		if (isDeepEqual === void 0) lazyLoadComparison();
		if (!isDeepStrictEqual(actual, expected)) innerFail({
			actual,
			expected,
			message,
			operator: "deepStrictEqual",
			stackStartFn: deepStrictEqual
		});
	};
	assert.notDeepStrictEqual = notDeepStrictEqual;
	function notDeepStrictEqual(actual, expected, message) {
		if (arguments.length < 2) throw new ERR_MISSING_ARGS("actual", "expected");
		if (isDeepEqual === void 0) lazyLoadComparison();
		if (isDeepStrictEqual(actual, expected)) innerFail({
			actual,
			expected,
			message,
			operator: "notDeepStrictEqual",
			stackStartFn: notDeepStrictEqual
		});
	}
	assert.strictEqual = function strictEqual(actual, expected, message) {
		if (arguments.length < 2) throw new ERR_MISSING_ARGS("actual", "expected");
		if (!objectIs(actual, expected)) innerFail({
			actual,
			expected,
			message,
			operator: "strictEqual",
			stackStartFn: strictEqual
		});
	};
	assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
		if (arguments.length < 2) throw new ERR_MISSING_ARGS("actual", "expected");
		if (objectIs(actual, expected)) innerFail({
			actual,
			expected,
			message,
			operator: "notStrictEqual",
			stackStartFn: notStrictEqual
		});
	};
	var Comparison = /*#__PURE__*/ _createClass(function Comparison(obj, keys, actual) {
		var _this = this;
		_classCallCheck(this, Comparison);
		keys.forEach(function(key) {
			if (key in obj) {
				if (actual !== void 0 && typeof actual[key] === "string" && isRegExp(obj[key]) && RegExpPrototypeTest(obj[key], actual[key])) _this[key] = actual[key];
				else _this[key] = obj[key];
			}
		});
	});
	function compareExceptionKey(actual, expected, key, message, keys, fn) {
		if (!(key in actual) || !isDeepStrictEqual(actual[key], expected[key])) {
			if (!message) {
				var err = new AssertionError({
					actual: new Comparison(actual, keys),
					expected: new Comparison(expected, keys, actual),
					operator: "deepStrictEqual",
					stackStartFn: fn
				});
				err.actual = actual;
				err.expected = expected;
				err.operator = fn.name;
				throw err;
			}
			innerFail({
				actual,
				expected,
				message,
				operator: fn.name,
				stackStartFn: fn
			});
		}
	}
	function expectedException(actual, expected, msg, fn) {
		if (typeof expected !== "function") {
			if (isRegExp(expected)) return RegExpPrototypeTest(expected, actual);
			if (arguments.length === 2) throw new ERR_INVALID_ARG_TYPE("expected", ["Function", "RegExp"], expected);
			if (_typeof(actual) !== "object" || actual === null) {
				var err = new AssertionError({
					actual,
					expected,
					message: msg,
					operator: "deepStrictEqual",
					stackStartFn: fn
				});
				err.operator = fn.name;
				throw err;
			}
			var keys = Object.keys(expected);
			if (expected instanceof Error) keys.push("name", "message");
			else if (keys.length === 0) throw new ERR_INVALID_ARG_VALUE("error", expected, "may not be an empty object");
			if (isDeepEqual === void 0) lazyLoadComparison();
			keys.forEach(function(key) {
				if (typeof actual[key] === "string" && isRegExp(expected[key]) && RegExpPrototypeTest(expected[key], actual[key])) return;
				compareExceptionKey(actual, expected, key, msg, keys, fn);
			});
			return true;
		}
		if (expected.prototype !== void 0 && actual instanceof expected) return true;
		if (Error.isPrototypeOf(expected)) return false;
		return expected.call({}, actual) === true;
	}
	function getActual(fn) {
		if (typeof fn !== "function") throw new ERR_INVALID_ARG_TYPE("fn", "Function", fn);
		try {
			fn();
		} catch (e) {
			return e;
		}
		return NO_EXCEPTION_SENTINEL;
	}
	function checkIsPromise(obj) {
		return isPromise(obj) || obj !== null && _typeof(obj) === "object" && typeof obj.then === "function" && typeof obj.catch === "function";
	}
	function waitForActual(promiseFn) {
		return Promise.resolve().then(function() {
			var resultPromise;
			if (typeof promiseFn === "function") {
				resultPromise = promiseFn();
				if (!checkIsPromise(resultPromise)) throw new ERR_INVALID_RETURN_VALUE("instance of Promise", "promiseFn", resultPromise);
			} else if (checkIsPromise(promiseFn)) resultPromise = promiseFn;
			else throw new ERR_INVALID_ARG_TYPE("promiseFn", ["Function", "Promise"], promiseFn);
			return Promise.resolve().then(function() {
				return resultPromise;
			}).then(function() {
				return NO_EXCEPTION_SENTINEL;
			}).catch(function(e) {
				return e;
			});
		});
	}
	function expectsError(stackStartFn, actual, error, message) {
		if (typeof error === "string") {
			if (arguments.length === 4) throw new ERR_INVALID_ARG_TYPE("error", [
				"Object",
				"Error",
				"Function",
				"RegExp"
			], error);
			if (_typeof(actual) === "object" && actual !== null) {
				if (actual.message === error) throw new ERR_AMBIGUOUS_ARGUMENT("error/message", "The error message \"".concat(actual.message, "\" is identical to the message."));
			} else if (actual === error) throw new ERR_AMBIGUOUS_ARGUMENT("error/message", "The error \"".concat(actual, "\" is identical to the message."));
			message = error;
			error = void 0;
		} else if (error != null && _typeof(error) !== "object" && typeof error !== "function") throw new ERR_INVALID_ARG_TYPE("error", [
			"Object",
			"Error",
			"Function",
			"RegExp"
		], error);
		if (actual === NO_EXCEPTION_SENTINEL) {
			var details = "";
			if (error && error.name) details += " (".concat(error.name, ")");
			details += message ? ": ".concat(message) : ".";
			var fnType = stackStartFn.name === "rejects" ? "rejection" : "exception";
			innerFail({
				actual: void 0,
				expected: error,
				operator: stackStartFn.name,
				message: "Missing expected ".concat(fnType).concat(details),
				stackStartFn
			});
		}
		if (error && !expectedException(actual, error, message, stackStartFn)) throw actual;
	}
	function expectsNoError(stackStartFn, actual, error, message) {
		if (actual === NO_EXCEPTION_SENTINEL) return;
		if (typeof error === "string") {
			message = error;
			error = void 0;
		}
		if (!error || expectedException(actual, error)) {
			var details = message ? ": ".concat(message) : ".";
			var fnType = stackStartFn.name === "doesNotReject" ? "rejection" : "exception";
			innerFail({
				actual,
				expected: error,
				operator: stackStartFn.name,
				message: "Got unwanted ".concat(fnType).concat(details, "\n") + "Actual message: \"".concat(actual && actual.message, "\""),
				stackStartFn
			});
		}
		throw actual;
	}
	assert.throws = function throws(promiseFn) {
		for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) args[_key2 - 1] = arguments[_key2];
		expectsError.apply(void 0, [throws, getActual(promiseFn)].concat(args));
	};
	assert.rejects = function rejects(promiseFn) {
		for (var _len3 = arguments.length, args = new Array(_len3 > 1 ? _len3 - 1 : 0), _key3 = 1; _key3 < _len3; _key3++) args[_key3 - 1] = arguments[_key3];
		return waitForActual(promiseFn).then(function(result) {
			return expectsError.apply(void 0, [rejects, result].concat(args));
		});
	};
	assert.doesNotThrow = function doesNotThrow(fn) {
		for (var _len4 = arguments.length, args = new Array(_len4 > 1 ? _len4 - 1 : 0), _key4 = 1; _key4 < _len4; _key4++) args[_key4 - 1] = arguments[_key4];
		expectsNoError.apply(void 0, [doesNotThrow, getActual(fn)].concat(args));
	};
	assert.doesNotReject = function doesNotReject(fn) {
		for (var _len5 = arguments.length, args = new Array(_len5 > 1 ? _len5 - 1 : 0), _key5 = 1; _key5 < _len5; _key5++) args[_key5 - 1] = arguments[_key5];
		return waitForActual(fn).then(function(result) {
			return expectsNoError.apply(void 0, [doesNotReject, result].concat(args));
		});
	};
	assert.ifError = function ifError(err) {
		if (err !== null && err !== void 0) {
			var message = "ifError got unwanted exception: ";
			if (_typeof(err) === "object" && typeof err.message === "string") {
				if (err.message.length === 0 && err.constructor) message += err.constructor.name;
				else message += err.message;
			} else message += inspect(err);
			var newErr = new AssertionError({
				actual: err,
				expected: null,
				operator: "ifError",
				message,
				stackStartFn: ifError
			});
			var origStack = err.stack;
			if (typeof origStack === "string") {
				var tmp2 = origStack.split("\n");
				tmp2.shift();
				var tmp1 = newErr.stack.split("\n");
				for (var i = 0; i < tmp2.length; i++) {
					var pos = tmp1.indexOf(tmp2[i]);
					if (pos !== -1) {
						tmp1 = tmp1.slice(0, pos);
						break;
					}
				}
				newErr.stack = "".concat(tmp1.join("\n"), "\n").concat(tmp2.join("\n"));
			}
			throw newErr;
		}
	};
	function internalMatch(string, regexp, message, fn, fnName) {
		if (!isRegExp(regexp)) throw new ERR_INVALID_ARG_TYPE("regexp", "RegExp", regexp);
		var match = fnName === "match";
		if (typeof string !== "string" || RegExpPrototypeTest(regexp, string) !== match) {
			if (message instanceof Error) throw message;
			var generatedMessage = !message;
			message = message || (typeof string !== "string" ? "The \"string\" argument must be of type string. Received type " + "".concat(_typeof(string), " (").concat(inspect(string), ")") : (match ? "The input did not match the regular expression " : "The input was expected to not match the regular expression ") + "".concat(inspect(regexp), ". Input:\n\n").concat(inspect(string), "\n"));
			var err = new AssertionError({
				actual: string,
				expected: regexp,
				message,
				operator: fnName,
				stackStartFn: fn
			});
			err.generatedMessage = generatedMessage;
			throw err;
		}
	}
	assert.match = function match(string, regexp, message) {
		internalMatch(string, regexp, message, match, "match");
	};
	assert.doesNotMatch = function doesNotMatch(string, regexp, message) {
		internalMatch(string, regexp, message, doesNotMatch, "doesNotMatch");
	};
	function strict() {
		for (var _len6 = arguments.length, args = new Array(_len6), _key6 = 0; _key6 < _len6; _key6++) args[_key6] = arguments[_key6];
		innerOk.apply(void 0, [strict, args.length].concat(args));
	}
	assert.strict = objectAssign(strict, assert, {
		equal: assert.strictEqual,
		deepEqual: assert.deepStrictEqual,
		notEqual: assert.notStrictEqual,
		notDeepEqual: assert.notDeepStrictEqual
	});
	assert.strict.strict = assert.strict;
}));
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/_internal/utils.mjs
var import_assert = /* @__PURE__ */ __toESM(require_assert(), 1);
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
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/assert.mjs
const ERR_AMBIGUOUS_ARGUMENT = Error;
const ERR_INVALID_ARG_TYPE = Error;
const ERR_INVALID_ARG_VALUE = Error;
const ERR_INVALID_RETURN_VALUE = Error;
const ERR_MISSING_ARGS = Error;
var AssertionError$1 = class extends Error {
	actual;
	expected;
	operator;
	generatedMessage;
	code = "ERR_ASSERTION";
	constructor(options) {
		super();
		this.actual = options.actual;
		this.expected = options.expected;
		this.operator = options.operator || "";
		this.generatedMessage = options.message === void 0;
		const stackStartFn = options.stackStartFn || fail$1;
		Error.captureStackTrace?.(this, stackStartFn);
	}
};
const inspect = (val, opts) => val;
const isEqual = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
const isDeepEqual = isEqual;
const isDeepStrictEqual = isEqual;
let warned = false;
const NO_EXCEPTION_SENTINEL = {};
function ok$1(...args) {
	innerOk(ok$1, args.length, ...args);
}
function equal$1(actual, expected, message) {
	if (arguments.length < 2) throw new ERR_MISSING_ARGS("actual", "expected");
	if (actual != expected && (!Number.isNaN(actual) || !Number.isNaN(expected))) innerFail({
		actual,
		expected,
		message,
		operator: "==",
		stackStartFn: equal$1
	});
}
function notEqual$1(actual, expected, message) {
	if (arguments.length < 2) throw new ERR_MISSING_ARGS("actual", "expected");
	if (actual == expected || Number.isNaN(actual) && Number.isNaN(expected)) innerFail({
		actual,
		expected,
		message,
		operator: "!=",
		stackStartFn: notEqual$1
	});
}
function deepEqual$1(actual, expected, message) {
	if (arguments.length < 2) throw new ERR_MISSING_ARGS("actual", "expected");
	if (!isDeepEqual(actual, expected)) innerFail({
		actual,
		expected,
		message,
		operator: "deepEqual",
		stackStartFn: deepEqual$1
	});
}
function notDeepEqual$1(actual, expected, message) {
	if (arguments.length < 2) throw new ERR_MISSING_ARGS("actual", "expected");
	if (isDeepEqual(actual, expected)) innerFail({
		actual,
		expected,
		message,
		operator: "notDeepEqual",
		stackStartFn: notDeepEqual$1
	});
}
function deepStrictEqual$1(actual, expected, message) {
	if (arguments.length < 2) throw new ERR_MISSING_ARGS("actual", "expected");
	if (!isDeepStrictEqual(actual, expected)) innerFail({
		actual,
		expected,
		message,
		operator: "deepStrictEqual",
		stackStartFn: deepStrictEqual$1
	});
}
function notDeepStrictEqual$1(actual, expected, message) {
	if (arguments.length < 2) throw new ERR_MISSING_ARGS("actual", "expected");
	if (isDeepStrictEqual(actual, expected)) innerFail({
		actual,
		expected,
		message,
		operator: "notDeepStrictEqual",
		stackStartFn: notDeepStrictEqual$1
	});
}
function strictEqual$1(actual, expected, message) {
	if (arguments.length < 2) throw new ERR_MISSING_ARGS("actual", "expected");
	if (!Object.is(actual, expected)) innerFail({
		actual,
		expected,
		message,
		operator: "strictEqual",
		stackStartFn: strictEqual$1
	});
}
function notStrictEqual$1(actual, expected, message) {
	if (arguments.length < 2) throw new ERR_MISSING_ARGS("actual", "expected");
	if (Object.is(actual, expected)) innerFail({
		actual,
		expected,
		message,
		operator: "notStrictEqual",
		stackStartFn: notStrictEqual$1
	});
}
function throws$1(promiseFn, ...args) {
	expectsError(throws$1, getActual(promiseFn), ...args);
}
async function rejects$1(promiseFn, ...args) {
	expectsError(rejects$1, await waitForActual(promiseFn), ...args);
}
function doesNotThrow$1(fn, ...args) {
	expectsNoError(doesNotThrow$1, getActual(fn), ...args);
}
async function doesNotReject$1(fn, ...args) {
	expectsNoError(doesNotReject$1, await waitForActual(fn), ...args);
}
function ifError$1(err) {
	if (err !== null && err !== void 0) {
		let message = "ifError got unwanted exception: ";
		if (typeof err === "object" && typeof err.message === "string") {
			if (err.message.length === 0 && err.constructor) message += err.constructor.name;
			else message += err.message;
		} else message += inspect(err);
		const newErr = new AssertionError$1({
			actual: err,
			expected: null,
			operator: "ifError",
			message,
			stackStartFn: ifError$1
		});
		const origStack = err?.stack;
		if (typeof origStack === "string") {
			const origStackStart = origStack.indexOf("\n    at");
			if (origStackStart !== -1) {
				const originalFrames = origStack.slice(origStackStart + 1).split("\n");
				let newFrames = (newErr.stack || "").split("\n");
				for (const errFrame of originalFrames) {
					const pos = newFrames.indexOf(errFrame);
					if (pos !== -1) {
						newFrames = newFrames.slice(0, pos);
						break;
					}
				}
				newErr.stack = `${newFrames.join("\n")}\n${originalFrames.join("\n")}`;
			}
		}
		throw newErr;
	}
}
function match$1(string, regexp, message) {
	internalMatch(string, regexp, message, match$1);
}
function doesNotMatch$1(string, regexp, message) {
	internalMatch(string, regexp, message, doesNotMatch$1);
}
function fail$1(actual, expected, message, operator, stackStartFn) {
	const argsLen = arguments.length;
	let internalMessage = false;
	if (actual == null && argsLen <= 1) {
		internalMessage = true;
		message = "Failed";
	} else if (argsLen === 1) {
		message = actual;
		actual = void 0;
	} else {
		if (warned === false) {
			warned = true;
			process.emitWarning("assert.fail() with more than one argument is deprecated. Please use assert.strictEqual() instead or only pass a message.", "DeprecationWarning", "DEP0094");
		}
		if (argsLen === 2) operator = "!=";
	}
	if (message instanceof Error) throw message;
	const err = new AssertionError$1({
		actual,
		expected,
		operator: operator === void 0 ? "fail" : operator,
		stackStartFn: stackStartFn || fail$1,
		message
	});
	if (internalMessage) err.generatedMessage = true;
	throw err;
}
function innerFail(obj) {
	if (obj.message instanceof Error) throw obj.message;
	throw new AssertionError$1(obj);
}
function innerOk(fn, argLen, value, message) {
	if (!value) {
		let generatedMessage = false;
		if (argLen === 0) {
			generatedMessage = true;
			message = "No value argument passed to `assert.ok()`";
		} else if (message == null) {
			generatedMessage = true;
			message = "<null>";
		} else if (message instanceof Error) throw message;
		const err = new AssertionError$1({
			actual: value,
			expected: true,
			message,
			operator: "==",
			stackStartFn: fn
		});
		err.generatedMessage = generatedMessage;
		throw err;
	}
}
var Comparison = class {
	constructor(obj, keys, actual) {
		for (const key of keys) if (key in obj) {
			if (actual !== void 0 && typeof actual[key] === "string" && obj[key] instanceof RegExp && obj[key].exec(actual[key]) !== null) this[key] = actual[key];
			else this[key] = obj[key];
		}
	}
};
function compareExceptionKey(actual, expected, key, message, keys, fn) {
	if (!(key in actual) || !isDeepStrictEqual(actual[key], expected[key])) {
		if (!message) {
			const err = new AssertionError$1({
				actual: new Comparison(actual, keys),
				expected: new Comparison(expected, keys, actual),
				operator: "deepStrictEqual",
				stackStartFn: fn
			});
			err.actual = actual;
			err.expected = expected;
			err.operator = fn.name;
			throw err;
		}
		innerFail({
			actual,
			expected,
			message,
			operator: fn.name,
			stackStartFn: fn
		});
	}
}
function expectedException(actual, expected, message, fn) {
	let generatedMessage = false;
	let throwError = false;
	if (typeof expected !== "function") {
		if (expected instanceof RegExp) {
			const str = String(actual);
			if (RegExp.prototype.exec.call(expected, str) !== null) return;
			if (!message) {
				generatedMessage = true;
				message = `The input did not match the regular expression ${inspect(expected)}. Input:\n\n${inspect(str)}\n`;
			}
			throwError = true;
		} else if (typeof actual !== "object" || actual === null) {
			const err = new AssertionError$1({
				actual,
				expected,
				message,
				operator: "deepStrictEqual",
				stackStartFn: fn
			});
			err.operator = fn.name;
			throw err;
		} else {
			const keys = Object.keys(expected);
			if (expected instanceof Error) keys.push("name", "message");
			else if (keys.length === 0) throw new ERR_INVALID_ARG_VALUE("error", expected, "may not be an empty object");
			for (const key of keys) {
				if (typeof actual[key] === "string" && expected[key] instanceof RegExp && expected[key].exec(actual[key]) !== null) continue;
				compareExceptionKey(actual, expected, key, message, keys, fn);
			}
			return;
		}
	} else if (expected.prototype !== void 0 && actual instanceof expected) return;
	else if (expected instanceof Error) {
		if (!message) {
			generatedMessage = true;
			message = `The error is expected to be an instance of "${expected.name}". Received `;
			if (actual instanceof Error) {
				const name = actual.constructor && actual.constructor.name || actual.name;
				if (expected.name === name) message += "an error with identical name but a different prototype.";
				else message += `"${name}"`;
				if (actual.message) message += `\n\nError message:\n\n${actual.message}`;
			} else message += `"${inspect(actual, { depth: -1 })}"`;
		}
		throwError = true;
	} else {
		const res = Reflect.apply(expected, {}, [actual]);
		if (res !== true) {
			if (!message) {
				generatedMessage = true;
				message = `The ${expected.name ? `"${expected.name}" ` : ""}validation function is expected to return "true". Received ${inspect(res)}`;
				if (actual instanceof Error) message += `\n\nCaught error:\n\n${actual}`;
			}
			throwError = true;
		}
	}
	if (throwError) {
		const err = new AssertionError$1({
			actual,
			expected,
			message,
			operator: fn.name,
			stackStartFn: fn
		});
		err.generatedMessage = generatedMessage;
		throw err;
	}
}
function getActual(fn) {
	try {
		fn();
	} catch (error_) {
		return error_;
	}
	return NO_EXCEPTION_SENTINEL;
}
function checkIsPromise(obj) {
	return obj instanceof Promise || obj !== null && typeof obj === "object" && typeof obj.then === "function" && typeof obj.catch === "function";
}
function internalMatch(string, regexp, message, fn) {
	if (!(regexp instanceof RegExp)) throw new ERR_INVALID_ARG_TYPE("regexp", "RegExp", regexp);
	const match = fn === assert$1.match;
	if (typeof string !== "string" || regexp.exec(string) !== null !== match) {
		if (message instanceof Error) throw message;
		const generatedMessage = !message;
		message = message || (typeof string === "string" ? (match ? "The input did not match the regular expression " : "The input was expected to not match the regular expression ") + `${inspect(regexp)}. Input:\n\n${inspect(string)}\n` : `The "string" argument must be of type string. Received type ${typeof string} (${inspect(string)})`);
		const err = new AssertionError$1({
			actual: string,
			expected: regexp,
			message,
			operator: fn?.name,
			stackStartFn: fn
		});
		err.generatedMessage = generatedMessage;
		throw err;
	}
}
async function waitForActual(promiseFn) {
	let resultPromise;
	if (typeof promiseFn === "function") {
		resultPromise = promiseFn();
		if (!checkIsPromise(resultPromise)) throw new ERR_INVALID_RETURN_VALUE("instance of Promise", "promiseFn", resultPromise);
	} else if (checkIsPromise(promiseFn)) resultPromise = promiseFn;
	else throw new ERR_INVALID_ARG_TYPE("promiseFn", ["Function", "Promise"], promiseFn);
	try {
		await resultPromise;
	} catch (error_) {
		return error_;
	}
	return NO_EXCEPTION_SENTINEL;
}
function expectsError(stackStartFn, actual, error, message) {
	if (typeof error === "string") {
		if (arguments.length === 4) throw new ERR_INVALID_ARG_TYPE("error", [
			"Object",
			"Error",
			"Function",
			"RegExp"
		], error);
		if (typeof actual === "object" && actual !== null) {
			if (actual?.message === error) throw new ERR_AMBIGUOUS_ARGUMENT("error/message", `The error message "${actual.message}" is identical to the message.`);
		} else if (actual === error) throw new ERR_AMBIGUOUS_ARGUMENT("error/message", `The error "${actual}" is identical to the message.`);
		message = error;
		error = void 0;
	} else if (error != null && typeof error !== "object" && typeof error !== "function") throw new ERR_INVALID_ARG_TYPE("error", [
		"Object",
		"Error",
		"Function",
		"RegExp"
	], error);
	if (actual === NO_EXCEPTION_SENTINEL) {
		let details = "";
		if (error && error.name) details += ` (${error.name})`;
		details += message ? `: ${message}` : ".";
		const fnType = stackStartFn === assert$1.rejects ? "rejection" : "exception";
		innerFail({
			actual: void 0,
			expected: error,
			operator: stackStartFn.name,
			message: `Missing expected ${fnType}${details}`,
			stackStartFn
		});
	}
	if (!error) return;
	expectedException(actual, error, message, stackStartFn);
}
function hasMatchingError(actual, expected) {
	if (typeof expected !== "function") {
		if (expected instanceof RegExp) {
			const str = String(actual);
			return RegExp.prototype.exec.call(expected, str) !== null;
		}
		throw new ERR_INVALID_ARG_TYPE("expected", ["Function", "RegExp"], expected);
	}
	if (expected.prototype !== void 0 && actual instanceof expected) return true;
	if (expected instanceof Error) return false;
	return Reflect.apply(expected, {}, [actual]) === true;
}
function expectsNoError(stackStartFn, actual, error, message) {
	if (actual === NO_EXCEPTION_SENTINEL) return;
	if (typeof error === "string") {
		message = error;
		error = void 0;
	}
	if (!error || hasMatchingError(actual, error)) {
		const details = message ? `: ${message}` : ".";
		const fnType = stackStartFn === assert$1.doesNotReject ? "rejection" : "exception";
		innerFail({
			actual,
			expected: error,
			operator: stackStartFn?.name,
			message: `Got unwanted ${fnType}${details}\nActual message: "${actual && actual.message}"`,
			stackStartFn
		});
	}
	throw actual;
}
const assert$1 = Object.assign(ok$1, {});
const CallTracker = /* @__PURE__ */ notImplementedClass("asset.CallTracker");
const partialDeepStrictEqual = /* @__PURE__ */ notImplemented("assert.partialDeepStrictEqual");
assert$1.fail = fail$1;
assert$1.ok = ok$1;
assert$1.equal = equal$1;
assert$1.notEqual = notEqual$1;
assert$1.deepEqual = deepEqual$1;
assert$1.notDeepEqual = notDeepEqual$1;
assert$1.deepStrictEqual = deepStrictEqual$1;
assert$1.notDeepStrictEqual = notDeepStrictEqual$1;
assert$1.strictEqual = strictEqual$1;
assert$1.notStrictEqual = notStrictEqual$1;
assert$1.throws = throws$1;
assert$1.rejects = rejects$1;
assert$1.doesNotThrow = doesNotThrow$1;
assert$1.doesNotReject = doesNotReject$1;
assert$1.ifError = ifError$1;
assert$1.match = match$1;
assert$1.doesNotMatch = doesNotMatch$1;
assert$1.partialDeepStrictEqual = partialDeepStrictEqual;
assert$1.AssertionError = AssertionError$1;
assert$1.CallTracker = CallTracker;
const strict$1 = Object.assign(function _strict(...args) {
	innerOk(strict$1, args.length, ...args);
}, assert$1, {
	equal: assert$1.strictEqual,
	deepEqual: assert$1.deepStrictEqual,
	notEqual: assert$1.notStrictEqual,
	notDeepEqual: assert$1.notDeepStrictEqual
});
assert$1.strict = strict$1;
assert$1.strict.strict = assert$1.strict;
//#endregion
//#region src/node/assert.ts
var assert_default = import_assert.default;
const { AssertionError, deepEqual, deepStrictEqual, doesNotMatch, doesNotReject, doesNotThrow, equal, fail, ifError, match, notDeepEqual, notDeepStrictEqual, notEqual, notStrictEqual, ok, rejects, strict, strictEqual, throws } = import_assert.default;
//#endregion
export { AssertionError, CallTracker, deepEqual, deepStrictEqual, assert_default as default, doesNotMatch, doesNotReject, doesNotThrow, equal, fail, ifError, match, notDeepEqual, notDeepStrictEqual, notEqual, notStrictEqual, ok, partialDeepStrictEqual, rejects, strict, strictEqual, throws };
