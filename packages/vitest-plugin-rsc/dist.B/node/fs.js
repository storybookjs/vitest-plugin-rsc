import * as m$5 from "node:path";
import * as m$4 from "node:buffer";
import * as m$3 from "process";
import * as m$2 from "node:url";
import * as m$1 from "node:stream";
import * as m from "node:events";
//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esmMin = (fn, res, err) => () => {
	if (err) throw err[0];
	try {
		return fn && (res = fn(fn = 0)), res;
	} catch (e) {
		throw err = [e], e;
	}
};
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
var __toCommonJS = (mod) => __hasOwnProp.call(mod, "module.exports") ? mod["module.exports"] : __copyProps(__defProp({}, "__esModule", { value: true }), mod);
//#endregion
//#region ../../node_modules/.pnpm/tslib@2.8.1/node_modules/tslib/tslib.es6.mjs
var tslib_es6_exports = /* @__PURE__ */ __exportAll({
	__addDisposableResource: () => __addDisposableResource,
	__assign: () => __assign,
	__asyncDelegator: () => __asyncDelegator,
	__asyncGenerator: () => __asyncGenerator,
	__asyncValues: () => __asyncValues,
	__await: () => __await,
	__awaiter: () => __awaiter,
	__classPrivateFieldGet: () => __classPrivateFieldGet,
	__classPrivateFieldIn: () => __classPrivateFieldIn,
	__classPrivateFieldSet: () => __classPrivateFieldSet,
	__createBinding: () => __createBinding,
	__decorate: () => __decorate,
	__disposeResources: () => __disposeResources,
	__esDecorate: () => __esDecorate,
	__exportStar: () => __exportStar,
	__extends: () => __extends,
	__generator: () => __generator,
	__importDefault: () => __importDefault,
	__importStar: () => __importStar,
	__makeTemplateObject: () => __makeTemplateObject,
	__metadata: () => __metadata,
	__param: () => __param,
	__propKey: () => __propKey,
	__read: () => __read,
	__rest: () => __rest,
	__rewriteRelativeImportExtension: () => __rewriteRelativeImportExtension,
	__runInitializers: () => __runInitializers,
	__setFunctionName: () => __setFunctionName,
	__spread: () => __spread,
	__spreadArray: () => __spreadArray,
	__spreadArrays: () => __spreadArrays,
	__values: () => __values,
	default: () => tslib_es6_default
});
function __extends(d, b) {
	if (typeof b !== "function" && b !== null) throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
	extendStatics(d, b);
	function __() {
		this.constructor = d;
	}
	d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}
function __rest(s, e) {
	var t = {};
	for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0) t[p] = s[p];
	if (s != null && typeof Object.getOwnPropertySymbols === "function") {
		for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i])) t[p[i]] = s[p[i]];
	}
	return t;
}
function __decorate(decorators, target, key, desc) {
	var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
	if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
	else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
	return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function __param(paramIndex, decorator) {
	return function(target, key) {
		decorator(target, key, paramIndex);
	};
}
function __esDecorate(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) {
			if (kind === "field") initializers.unshift(_);
			else descriptor[key] = _;
		}
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
}
function __runInitializers(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
}
function __propKey(x) {
	return typeof x === "symbol" ? x : "".concat(x);
}
function __setFunctionName(f, name, prefix) {
	if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
	return Object.defineProperty(f, "name", {
		configurable: true,
		value: prefix ? "".concat(prefix, " ", name) : name
	});
}
function __metadata(metadataKey, metadataValue) {
	if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
}
function __awaiter(thisArg, _arguments, P, generator) {
	function adopt(value) {
		return value instanceof P ? value : new P(function(resolve) {
			resolve(value);
		});
	}
	return new (P || (P = Promise))(function(resolve, reject) {
		function fulfilled(value) {
			try {
				step(generator.next(value));
			} catch (e) {
				reject(e);
			}
		}
		function rejected(value) {
			try {
				step(generator["throw"](value));
			} catch (e) {
				reject(e);
			}
		}
		function step(result) {
			result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
		}
		step((generator = generator.apply(thisArg, _arguments || [])).next());
	});
}
function __generator(thisArg, body) {
	var _ = {
		label: 0,
		sent: function() {
			if (t[0] & 1) throw t[1];
			return t[1];
		},
		trys: [],
		ops: []
	}, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
	return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
		return this;
	}), g;
	function verb(n) {
		return function(v) {
			return step([n, v]);
		};
	}
	function step(op) {
		if (f) throw new TypeError("Generator is already executing.");
		while (g && (g = 0, op[0] && (_ = 0)), _) try {
			if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
			if (y = 0, t) op = [op[0] & 2, t.value];
			switch (op[0]) {
				case 0:
				case 1:
					t = op;
					break;
				case 4:
					_.label++;
					return {
						value: op[1],
						done: false
					};
				case 5:
					_.label++;
					y = op[1];
					op = [0];
					continue;
				case 7:
					op = _.ops.pop();
					_.trys.pop();
					continue;
				default:
					if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
						_ = 0;
						continue;
					}
					if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
						_.label = op[1];
						break;
					}
					if (op[0] === 6 && _.label < t[1]) {
						_.label = t[1];
						t = op;
						break;
					}
					if (t && _.label < t[2]) {
						_.label = t[2];
						_.ops.push(op);
						break;
					}
					if (t[2]) _.ops.pop();
					_.trys.pop();
					continue;
			}
			op = body.call(thisArg, _);
		} catch (e) {
			op = [6, e];
			y = 0;
		} finally {
			f = t = 0;
		}
		if (op[0] & 5) throw op[1];
		return {
			value: op[0] ? op[1] : void 0,
			done: true
		};
	}
}
function __exportStar(m, o) {
	for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(o, p)) __createBinding(o, m, p);
}
function __values(o) {
	var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
	if (m) return m.call(o);
	if (o && typeof o.length === "number") return { next: function() {
		if (o && i >= o.length) o = void 0;
		return {
			value: o && o[i++],
			done: !o
		};
	} };
	throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
}
function __read(o, n) {
	var m = typeof Symbol === "function" && o[Symbol.iterator];
	if (!m) return o;
	var i = m.call(o), r, ar = [], e;
	try {
		while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
	} catch (error) {
		e = { error };
	} finally {
		try {
			if (r && !r.done && (m = i["return"])) m.call(i);
		} finally {
			if (e) throw e.error;
		}
	}
	return ar;
}
function __spread() {
	for (var ar = [], i = 0; i < arguments.length; i++) ar = ar.concat(__read(arguments[i]));
	return ar;
}
function __spreadArrays() {
	for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
	for (var r = Array(s), k = 0, i = 0; i < il; i++) for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++) r[k] = a[j];
	return r;
}
function __spreadArray(to, from, pack) {
	if (pack || arguments.length === 2) {
		for (var i = 0, l = from.length, ar; i < l; i++) if (ar || !(i in from)) {
			if (!ar) ar = Array.prototype.slice.call(from, 0, i);
			ar[i] = from[i];
		}
	}
	return to.concat(ar || Array.prototype.slice.call(from));
}
function __await(v) {
	return this instanceof __await ? (this.v = v, this) : new __await(v);
}
function __asyncGenerator(thisArg, _arguments, generator) {
	if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
	var g = generator.apply(thisArg, _arguments || []), i, q = [];
	return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function() {
		return this;
	}, i;
	function awaitReturn(f) {
		return function(v) {
			return Promise.resolve(v).then(f, reject);
		};
	}
	function verb(n, f) {
		if (g[n]) {
			i[n] = function(v) {
				return new Promise(function(a, b) {
					q.push([
						n,
						v,
						a,
						b
					]) > 1 || resume(n, v);
				});
			};
			if (f) i[n] = f(i[n]);
		}
	}
	function resume(n, v) {
		try {
			step(g[n](v));
		} catch (e) {
			settle(q[0][3], e);
		}
	}
	function step(r) {
		r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r);
	}
	function fulfill(value) {
		resume("next", value);
	}
	function reject(value) {
		resume("throw", value);
	}
	function settle(f, v) {
		if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]);
	}
}
function __asyncDelegator(o) {
	var i = {}, p;
	return verb("next"), verb("throw", function(e) {
		throw e;
	}), verb("return"), i[Symbol.iterator] = function() {
		return this;
	}, i;
	function verb(n, f) {
		i[n] = o[n] ? function(v) {
			return (p = !p) ? {
				value: __await(o[n](v)),
				done: false
			} : f ? f(v) : v;
		} : f;
	}
}
function __asyncValues(o) {
	if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
	var m = o[Symbol.asyncIterator], i;
	return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function() {
		return this;
	}, i);
	function verb(n) {
		i[n] = o[n] && function(v) {
			return new Promise(function(resolve, reject) {
				v = o[n](v), settle(resolve, reject, v.done, v.value);
			});
		};
	}
	function settle(resolve, reject, d, v) {
		Promise.resolve(v).then(function(v) {
			resolve({
				value: v,
				done: d
			});
		}, reject);
	}
}
function __makeTemplateObject(cooked, raw) {
	if (Object.defineProperty) Object.defineProperty(cooked, "raw", { value: raw });
	else cooked.raw = raw;
	return cooked;
}
function __importStar(mod) {
	if (mod && mod.__esModule) return mod;
	var result = {};
	if (mod != null) {
		for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
	}
	__setModuleDefault(result, mod);
	return result;
}
function __importDefault(mod) {
	return mod && mod.__esModule ? mod : { default: mod };
}
function __classPrivateFieldGet(receiver, state, kind, f) {
	if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
	if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
	return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}
function __classPrivateFieldSet(receiver, state, value, kind, f) {
	if (kind === "m") throw new TypeError("Private method is not writable");
	if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
	if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
	return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
}
function __classPrivateFieldIn(state, receiver) {
	if (receiver === null || typeof receiver !== "object" && typeof receiver !== "function") throw new TypeError("Cannot use 'in' operator on non-object");
	return typeof state === "function" ? receiver === state : state.has(receiver);
}
function __addDisposableResource(env, value, async) {
	if (value !== null && value !== void 0) {
		if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
		var dispose, inner;
		if (async) {
			if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
			dispose = value[Symbol.asyncDispose];
		}
		if (dispose === void 0) {
			if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
			dispose = value[Symbol.dispose];
			if (async) inner = dispose;
		}
		if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
		if (inner) dispose = function() {
			try {
				inner.call(this);
			} catch (e) {
				return Promise.reject(e);
			}
		};
		env.stack.push({
			value,
			dispose,
			async
		});
	} else if (async) env.stack.push({ async: true });
	return value;
}
function __disposeResources(env) {
	function fail(e) {
		env.error = env.hasError ? new _SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
		env.hasError = true;
	}
	var r, s = 0;
	function next() {
		while (r = env.stack.pop()) try {
			if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
			if (r.dispose) {
				var result = r.dispose.call(r.value);
				if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) {
					fail(e);
					return next();
				});
			} else s |= 1;
		} catch (e) {
			fail(e);
		}
		if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
		if (env.hasError) throw env.error;
	}
	return next();
}
function __rewriteRelativeImportExtension(path, preserveJsx) {
	if (typeof path === "string" && /^\.\.?\//.test(path)) return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function(m, tsx, d, ext, cm) {
		return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : d + ext + "." + cm.toLowerCase() + "js";
	});
	return path;
}
var extendStatics, __assign, __createBinding, __setModuleDefault, ownKeys, _SuppressedError, tslib_es6_default;
var init_tslib_es6 = __esmMin((() => {
	extendStatics = function(d, b) {
		extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d, b) {
			d.__proto__ = b;
		} || function(d, b) {
			for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p];
		};
		return extendStatics(d, b);
	};
	__assign = function() {
		__assign = Object.assign || function __assign(t) {
			for (var s, i = 1, n = arguments.length; i < n; i++) {
				s = arguments[i];
				for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
			}
			return t;
		};
		return __assign.apply(this, arguments);
	};
	__createBinding = Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	});
	__setModuleDefault = Object.create ? (function(o, v) {
		Object.defineProperty(o, "default", {
			enumerable: true,
			value: v
		});
	}) : function(o, v) {
		o["default"] = v;
	};
	ownKeys = function(o) {
		ownKeys = Object.getOwnPropertyNames || function(o) {
			var ar = [];
			for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
			return ar;
		};
		return ownKeys(o);
	};
	_SuppressedError = typeof SuppressedError === "function" ? SuppressedError : function(error, suppressed, message) {
		var e = new Error(message);
		return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
	};
	tslib_es6_default = {
		__extends,
		__assign,
		__rest,
		__decorate,
		__param,
		__esDecorate,
		__runInitializers,
		__propKey,
		__setFunctionName,
		__metadata,
		__awaiter,
		__generator,
		__createBinding,
		__exportStar,
		__values,
		__read,
		__spread,
		__spreadArrays,
		__spreadArray,
		__await,
		__asyncGenerator,
		__asyncDelegator,
		__asyncValues,
		__makeTemplateObject,
		__importStar,
		__importDefault,
		__classPrivateFieldGet,
		__classPrivateFieldSet,
		__classPrivateFieldIn,
		__addDisposableResource,
		__disposeResources,
		__rewriteRelativeImportExtension
	};
}));
//#endregion
//#region \0require-as-import:node:path
var require__require_as_import_node_path = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = m$5.default;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node-builtins@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node-builtins/lib/path.js
var require_path$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.basename = exports.isAbsolute = exports.normalize = exports.dirname = exports.relative = exports.join = exports.posix = exports.sep = exports.resolve = void 0;
	var node_path_1 = require__require_as_import_node_path();
	Object.defineProperty(exports, "resolve", {
		enumerable: true,
		get: function() {
			return node_path_1.resolve;
		}
	});
	Object.defineProperty(exports, "sep", {
		enumerable: true,
		get: function() {
			return node_path_1.sep;
		}
	});
	Object.defineProperty(exports, "posix", {
		enumerable: true,
		get: function() {
			return node_path_1.posix;
		}
	});
	Object.defineProperty(exports, "join", {
		enumerable: true,
		get: function() {
			return node_path_1.join;
		}
	});
	Object.defineProperty(exports, "relative", {
		enumerable: true,
		get: function() {
			return node_path_1.relative;
		}
	});
	Object.defineProperty(exports, "dirname", {
		enumerable: true,
		get: function() {
			return node_path_1.dirname;
		}
	});
	Object.defineProperty(exports, "normalize", {
		enumerable: true,
		get: function() {
			return node_path_1.normalize;
		}
	});
	Object.defineProperty(exports, "isAbsolute", {
		enumerable: true,
		get: function() {
			return node_path_1.isAbsolute;
		}
	});
	Object.defineProperty(exports, "basename", {
		enumerable: true,
		get: function() {
			return node_path_1.basename;
		}
	});
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-core@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-core/lib/types.js
var require_types$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region \0require-as-import:node:buffer
var require__require_as_import_node_buffer = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = m$4.default;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node-builtins@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node-builtins/lib/buffer.js
var require_buffer$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Buffer = void 0;
	var node_buffer_1 = require__require_as_import_node_buffer();
	Object.defineProperty(exports, "Buffer", {
		enumerable: true,
		get: function() {
			return node_buffer_1.Buffer;
		}
	});
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node-builtins@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node-builtins/lib/internal/buffer.js
var require_buffer = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.bufferFrom = exports.bufferAllocUnsafe = exports.Buffer = void 0;
	const buffer_1 = require_buffer$1();
	Object.defineProperty(exports, "Buffer", {
		enumerable: true,
		get: function() {
			return buffer_1.Buffer;
		}
	});
	function bufferV0P12Ponyfill(arg0, ...args) {
		return new buffer_1.Buffer(arg0, ...args);
	}
	exports.bufferAllocUnsafe = buffer_1.Buffer.allocUnsafe || bufferV0P12Ponyfill;
	exports.bufferFrom = buffer_1.Buffer.from || bufferV0P12Ponyfill;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node-utils@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node-utils/lib/types/index.js
var require_types = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node-utils@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node-utils/lib/constants.js
var require_constants$3 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.FLAGS = exports.ERRSTR = exports.constants = exports.SEP = void 0;
	exports.SEP = "/";
	exports.constants = {
		O_RDONLY: 0,
		O_WRONLY: 1,
		O_RDWR: 2,
		S_IFMT: 61440,
		S_IFREG: 32768,
		S_IFDIR: 16384,
		S_IFCHR: 8192,
		S_IFBLK: 24576,
		S_IFIFO: 4096,
		S_IFLNK: 40960,
		S_IFSOCK: 49152,
		O_CREAT: 64,
		O_EXCL: 128,
		O_NOCTTY: 256,
		O_TRUNC: 512,
		O_APPEND: 1024,
		O_DIRECTORY: 65536,
		O_NOATIME: 262144,
		O_NOFOLLOW: 131072,
		O_SYNC: 1052672,
		O_SYMLINK: 2097152,
		O_DIRECT: 16384,
		O_NONBLOCK: 2048,
		S_IRWXU: 448,
		S_IRUSR: 256,
		S_IWUSR: 128,
		S_IXUSR: 64,
		S_IRWXG: 56,
		S_IRGRP: 32,
		S_IWGRP: 16,
		S_IXGRP: 8,
		S_IRWXO: 7,
		S_IROTH: 4,
		S_IWOTH: 2,
		S_IXOTH: 1,
		F_OK: 0,
		R_OK: 4,
		W_OK: 2,
		X_OK: 1,
		UV_FS_SYMLINK_DIR: 1,
		UV_FS_SYMLINK_JUNCTION: 2,
		UV_FS_COPYFILE_EXCL: 1,
		UV_FS_COPYFILE_FICLONE: 2,
		UV_FS_COPYFILE_FICLONE_FORCE: 4,
		COPYFILE_EXCL: 1,
		COPYFILE_FICLONE: 2,
		COPYFILE_FICLONE_FORCE: 4
	};
	exports.ERRSTR = {
		PATH_STR: "path must be a string, Buffer, or Uint8Array",
		FD: "fd must be a file descriptor",
		MODE_INT: "mode must be an int",
		CB: "callback must be a function",
		UID: "uid must be an unsigned int",
		GID: "gid must be an unsigned int",
		LEN: "len must be an integer",
		ATIME: "atime must be an integer",
		MTIME: "mtime must be an integer",
		PREFIX: "filename prefix is required",
		BUFFER: "buffer must be an instance of Buffer or StaticBuffer",
		OFFSET: "offset must be an integer",
		LENGTH: "length must be an integer",
		POSITION: "position must be an integer"
	};
	const { O_RDONLY, O_WRONLY, O_RDWR, O_CREAT, O_EXCL, O_TRUNC, O_APPEND, O_SYNC } = exports.constants;
	var FLAGS;
	(function(FLAGS) {
		FLAGS[FLAGS["r"] = O_RDONLY] = "r";
		FLAGS[FLAGS["r+"] = O_RDWR] = "r+";
		FLAGS[FLAGS["rs"] = O_RDONLY | O_SYNC] = "rs";
		FLAGS[FLAGS["sr"] = FLAGS.rs] = "sr";
		FLAGS[FLAGS["rs+"] = O_RDWR | O_SYNC] = "rs+";
		FLAGS[FLAGS["sr+"] = FLAGS["rs+"]] = "sr+";
		FLAGS[FLAGS["w"] = O_WRONLY | O_CREAT | O_TRUNC] = "w";
		FLAGS[FLAGS["wx"] = O_WRONLY | O_CREAT | O_TRUNC | O_EXCL] = "wx";
		FLAGS[FLAGS["xw"] = FLAGS.wx] = "xw";
		FLAGS[FLAGS["w+"] = O_RDWR | O_CREAT | O_TRUNC] = "w+";
		FLAGS[FLAGS["wx+"] = O_RDWR | O_CREAT | O_TRUNC | O_EXCL] = "wx+";
		FLAGS[FLAGS["xw+"] = FLAGS["wx+"]] = "xw+";
		FLAGS[FLAGS["a"] = O_WRONLY | O_APPEND | O_CREAT] = "a";
		FLAGS[FLAGS["ax"] = O_WRONLY | O_APPEND | O_CREAT | O_EXCL] = "ax";
		FLAGS[FLAGS["xa"] = FLAGS.ax] = "xa";
		FLAGS[FLAGS["a+"] = O_RDWR | O_APPEND | O_CREAT] = "a+";
		FLAGS[FLAGS["ax+"] = O_RDWR | O_APPEND | O_CREAT | O_EXCL] = "ax+";
		FLAGS[FLAGS["xa+"] = FLAGS["ax+"]] = "xa+";
	})(FLAGS || (exports.FLAGS = FLAGS = {}));
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node-utils@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node-utils/lib/consts/AMODE.js
var require_AMODE = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node-utils@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node-utils/lib/consts/FLAG.js
var require_FLAG = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.FLAG = void 0;
	var FLAG;
	(function(FLAG) {
		FLAG[FLAG["O_RDONLY"] = 0] = "O_RDONLY";
		FLAG[FLAG["O_WRONLY"] = 1] = "O_WRONLY";
		FLAG[FLAG["O_RDWR"] = 2] = "O_RDWR";
		FLAG[FLAG["O_ACCMODE"] = 3] = "O_ACCMODE";
		FLAG[FLAG["O_CREAT"] = 64] = "O_CREAT";
		FLAG[FLAG["O_EXCL"] = 128] = "O_EXCL";
		FLAG[FLAG["O_NOCTTY"] = 256] = "O_NOCTTY";
		FLAG[FLAG["O_TRUNC"] = 512] = "O_TRUNC";
		FLAG[FLAG["O_APPEND"] = 1024] = "O_APPEND";
		FLAG[FLAG["O_NONBLOCK"] = 2048] = "O_NONBLOCK";
		FLAG[FLAG["O_DSYNC"] = 4096] = "O_DSYNC";
		FLAG[FLAG["FASYNC"] = 8192] = "FASYNC";
		FLAG[FLAG["O_DIRECT"] = 16384] = "O_DIRECT";
		FLAG[FLAG["O_LARGEFILE"] = 0] = "O_LARGEFILE";
		FLAG[FLAG["O_DIRECTORY"] = 65536] = "O_DIRECTORY";
		FLAG[FLAG["O_NOFOLLOW"] = 131072] = "O_NOFOLLOW";
		FLAG[FLAG["O_NOATIME"] = 262144] = "O_NOATIME";
		FLAG[FLAG["O_CLOEXEC"] = 524288] = "O_CLOEXEC";
		FLAG[FLAG["O_SYNC"] = 1052672] = "O_SYNC";
		FLAG[FLAG["O_NDELAY"] = 2048] = "O_NDELAY";
	})(FLAG || (exports.FLAG = FLAG = {}));
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node-utils@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node-utils/lib/path.js
var require_path = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.basename = exports.pathNormalize = exports.pathDirname = exports.pathRelative = exports.pathJoin = exports.pathSep = void 0;
	const path_1 = require_path$1();
	exports.pathSep = path_1.posix ? path_1.posix.sep : path_1.sep;
	exports.pathJoin = path_1.posix ? path_1.posix.join : path_1.join;
	exports.pathRelative = path_1.posix ? path_1.posix.relative : path_1.relative;
	exports.pathDirname = path_1.posix ? path_1.posix.dirname : path_1.dirname;
	exports.pathNormalize = path_1.posix ? path_1.posix.normalize : path_1.normalize;
	const basename = (path, separator) => {
		if (path[path.length - 1] === separator) path = path.slice(0, -1);
		const lastSlashIndex = path.lastIndexOf(separator);
		return lastSlashIndex === -1 ? path : path.slice(lastSlashIndex + 1);
	};
	exports.basename = basename;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node-utils@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node-utils/lib/inspectPrimitive.js
var require_inspectPrimitive = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.addNumericalSeparator = exports.formatPrimitive = exports.formatNumber = exports.quoteString = exports.escapeString = void 0;
	const MAX_STRING_LENGTH = 1e4;
	const META = [];
	for (let i = 0; i < 160; i++) META.push(i < 32 || i > 126 ? "\\x" + (i < 16 ? "0" : "") + i.toString(16).toUpperCase() : "");
	META[8] = "\\b";
	META[9] = "\\t";
	META[10] = "\\n";
	META[12] = "\\f";
	META[13] = "\\r";
	META[39] = "\\'";
	META[92] = "\\\\";
	const escapeString = (str, quote) => {
		let result = "";
		let last = 0;
		const length = str.length;
		for (let i = 0; i < length; i++) {
			const point = str.charCodeAt(i);
			if (point === quote || point === 92 || point < 32 || point > 126 && point < 160) {
				result += str.slice(last, i) + META[point];
				last = i + 1;
			} else if (point >= 55296 && point <= 57343) {
				if (point <= 56319 && i + 1 < length) {
					const next = str.charCodeAt(i + 1);
					if (next >= 56320 && next <= 57343) {
						i++;
						continue;
					}
				}
				result += str.slice(last, i) + "\\u" + point.toString(16);
				last = i + 1;
			}
		}
		return last === 0 ? str : result + str.slice(last);
	};
	exports.escapeString = escapeString;
	const quoteString = (str) => {
		if (str.indexOf("'") === -1) return "'" + (0, exports.escapeString)(str, 39) + "'";
		if (str.indexOf("\"") === -1) return "\"" + (0, exports.escapeString)(str, -1) + "\"";
		if (str.indexOf("`") === -1 && str.indexOf("${") === -1) return "`" + (0, exports.escapeString)(str, -1) + "`";
		return "'" + (0, exports.escapeString)(str, 39) + "'";
	};
	exports.quoteString = quoteString;
	const formatString = (value, indentation) => {
		let trailer = "";
		if (value.length > MAX_STRING_LENGTH) {
			const remaining = value.length - MAX_STRING_LENGTH;
			value = value.slice(0, MAX_STRING_LENGTH);
			trailer = "... " + remaining + " more character" + (remaining > 1 ? "s" : "");
		}
		const length = value.length;
		if (length <= 16 || length <= 76 - indentation) return (0, exports.quoteString)(value) + trailer;
		const separator = " +\n" + " ".repeat(indentation + 2);
		let out = "";
		let start = 0;
		let end = value.indexOf("\n");
		while (end !== -1 && end + 1 < length) {
			out += (0, exports.quoteString)(value.slice(start, end + 1)) + separator;
			start = end + 1;
			end = value.indexOf("\n", start);
		}
		return out + (0, exports.quoteString)(value.slice(start)) + trailer;
	};
	const formatNumber = (value) => Object.is(value, -0) ? "-0" : "" + value;
	exports.formatNumber = formatNumber;
	const formatPrimitive = (value, indentation) => {
		switch (typeof value) {
			case "string": return formatString(value, indentation);
			case "number": return (0, exports.formatNumber)(value);
			case "bigint": return value + "n";
			case "symbol": return value.toString();
			default: return "" + value;
		}
	};
	exports.formatPrimitive = formatPrimitive;
	const addNumericalSeparator = (val) => {
		let res = "";
		let i = val.length;
		const start = val.charCodeAt(0) === 45 ? 1 : 0;
		for (; i >= start + 4; i -= 3) res = "_" + val.slice(i - 3, i) + res;
		return val.slice(0, i) + res;
	};
	exports.addNumericalSeparator = addNumericalSeparator;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node-utils@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node-utils/lib/inspectLayout.js
var require_inspectLayout = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.reduceToSingleString = exports.MAX_ARRAY_LENGTH = exports.BREAK_LENGTH = void 0;
	exports.BREAK_LENGTH = 80;
	exports.MAX_ARRAY_LENGTH = 100;
	const MAX_COLUMNS = 12;
	const join = (output, separator) => {
		let str = "";
		const length = output.length;
		for (let i = 0; i < length; i++) str += (i ? separator : "") + output[i];
		return str;
	};
	const groupArrayElements = (ctx, output, value) => {
		let totalLength = 0;
		let maxLength = 0;
		let outputLength = output.length;
		if (exports.MAX_ARRAY_LENGTH < output.length) outputLength--;
		const dataLen = [];
		for (let i = 0; i < outputLength; i++) {
			const len = output[i].length;
			dataLen.push(len);
			totalLength += len + 2;
			if (maxLength < len) maxLength = len;
		}
		const actualMax = maxLength + 2;
		if (actualMax * 3 + ctx.indentationLvl >= exports.BREAK_LENGTH || totalLength / actualMax <= 5 && maxLength > 6) return output;
		const averageBias = Math.sqrt(actualMax - totalLength / output.length);
		const biasedMax = Math.max(actualMax - 3 - averageBias, 1);
		const columns = Math.min(Math.round(Math.sqrt(2.5 * biasedMax * outputLength) / biasedMax), Math.floor((exports.BREAK_LENGTH - ctx.indentationLvl) / actualMax), MAX_COLUMNS);
		if (columns <= 1) return output;
		const maxLineLength = [];
		for (let i = 0; i < columns; i++) {
			let lineMaxLength = 0;
			for (let j = i; j < output.length; j += columns) if (dataLen[j] > lineMaxLength) lineMaxLength = dataLen[j];
			maxLineLength.push(lineMaxLength + 2);
		}
		let padStart = value !== void 0;
		for (let i = 0; padStart && i < output.length; i++) if (typeof value[i] !== "number" && typeof value[i] !== "bigint") padStart = false;
		const grouped = [];
		for (let i = 0; i < outputLength; i += columns) {
			const max = Math.min(i + columns, outputLength);
			let str = "";
			let j = i;
			for (; j < max - 1; j++) {
				const cell = output[j] + ", ";
				str += padStart ? cell.padStart(maxLineLength[j - i], " ") : cell.padEnd(maxLineLength[j - i], " ");
			}
			str += padStart ? output[j].padStart(maxLineLength[j - i] - 2, " ") : output[j];
			grouped.push(str);
		}
		if (exports.MAX_ARRAY_LENGTH < output.length) grouped.push(output[outputLength]);
		return grouped;
	};
	const isBelowBreakLength = (output, start, base) => {
		let totalLength = output.length + start;
		if (totalLength + output.length > exports.BREAK_LENGTH) return false;
		for (let i = 0; i < output.length; i++) {
			totalLength += output[i].length;
			if (totalLength > exports.BREAK_LENGTH) return false;
		}
		return base === "" || base.indexOf("\n") === -1;
	};
	const reduceToSingleString = (ctx, output, base, braces, kind, recurseTimes, value) => {
		const entries = output.length;
		if (kind === 2 && entries > 6) output = groupArrayElements(ctx, output, value);
		const head = base ? base + " " + braces[0] : braces[0];
		if (ctx.currentDepth - recurseTimes < 3 && entries === output.length) {
			const start = output.length + ctx.indentationLvl + braces[0].length + base.length + 10;
			if (isBelowBreakLength(output, start, base)) {
				const joined = join(output, ", ");
				if (joined.indexOf("\n") === -1) return head + " " + joined + " " + braces[1];
			}
		}
		const indentation = "\n" + " ".repeat(ctx.indentationLvl);
		return head + indentation + "  " + join(output, "," + indentation + "  ") + indentation + braces[1];
	};
	exports.reduceToSingleString = reduceToSingleString;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node-utils@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node-utils/lib/inspectBrand.js
var require_inspectBrand = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.boxedBase = exports.functionBase = exports.classBase = exports.hexBytes = exports.moreItems = exports.isIndex = exports.nonIndexKeys = exports.ownKeys = exports.prefixOf = exports.constructorName = exports.isInstance = exports.hasBrand = exports.regExpSource = exports.dataViewBuffer = exports.sharedArrayBufferByteLength = exports.arrayBufferByteLength = exports.mapSize = exports.setSize = exports.typedArrayLength = exports.typedArrayTag = exports.getOwn = exports.isEnumerable = exports.hasOwn = exports.objectToString = void 0;
	const inspectPrimitive_1 = require_inspectPrimitive();
	const INDEX_REG = /^(0|[1-9][0-9]*)$/;
	exports.objectToString = Object.prototype.toString;
	exports.hasOwn = Object.prototype.hasOwnProperty;
	exports.isEnumerable = Object.prototype.propertyIsEnumerable;
	exports.getOwn = Object.getOwnPropertyDescriptor;
	const getter = (proto, key) => (0, exports.getOwn)(proto, key).get;
	const TypedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
	exports.typedArrayTag = getter(TypedArrayPrototype, Symbol.toStringTag);
	exports.typedArrayLength = getter(TypedArrayPrototype, "length");
	exports.setSize = getter(Set.prototype, "size");
	exports.mapSize = getter(Map.prototype, "size");
	exports.arrayBufferByteLength = getter(ArrayBuffer.prototype, "byteLength");
	exports.sharedArrayBufferByteLength = typeof SharedArrayBuffer === "undefined" ? void 0 : getter(SharedArrayBuffer.prototype, "byteLength");
	exports.dataViewBuffer = getter(DataView.prototype, "buffer");
	exports.regExpSource = getter(RegExp.prototype, "source");
	const hasBrand = (check, value) => {
		try {
			check.call(value);
			return true;
		} catch {
			return false;
		}
	};
	exports.hasBrand = hasBrand;
	const isInstance = (value, ctor) => {
		try {
			return value instanceof ctor;
		} catch {
			return false;
		}
	};
	exports.isInstance = isInstance;
	const constructorName = (value) => {
		let obj = value;
		let first;
		while (obj) {
			const descriptor = (0, exports.getOwn)(obj, "constructor");
			const ctor = descriptor && descriptor.value;
			if (typeof ctor === "function" && ctor.name !== "" && (0, exports.isInstance)(value, ctor)) return String(ctor.name);
			obj = Object.getPrototypeOf(obj);
			if (first === void 0) first = obj;
		}
		return first === null ? null : "Object";
	};
	exports.constructorName = constructorName;
	const prefixOf = (constructor, tag, fallback, size = "") => {
		if (constructor === null) {
			if (tag !== "" && fallback !== tag) return "[" + fallback + size + ": null prototype] [" + tag + "] ";
			return "[" + fallback + size + ": null prototype] ";
		}
		let result = constructor + size + " ";
		if (tag !== "") {
			const position = constructor.indexOf(tag);
			if (position === -1) result += "[" + tag + "] ";
			else {
				const end = position + tag.length;
				if (end !== constructor.length && constructor[end] === constructor[end].toLowerCase()) result += "[" + tag + "] ";
			}
		}
		return result;
	};
	exports.prefixOf = prefixOf;
	const ownKeys = (value) => {
		const keys = Object.keys(value);
		const symbols = Object.getOwnPropertySymbols(value);
		for (let i = 0; i < symbols.length; i++) if (exports.isEnumerable.call(value, symbols[i])) keys.push(symbols[i]);
		return keys;
	};
	exports.ownKeys = ownKeys;
	const nonIndexKeys = (value) => {
		const keys = (0, exports.ownKeys)(value);
		const out = [];
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i];
			if (typeof key !== "string" || !INDEX_REG.test(key) || +key > 4294967294) out.push(key);
		}
		return out;
	};
	exports.nonIndexKeys = nonIndexKeys;
	const isIndex = (key) => INDEX_REG.test(key);
	exports.isIndex = isIndex;
	const moreItems = (remaining) => "... " + remaining + " more item" + (remaining > 1 ? "s" : "");
	exports.moreItems = moreItems;
	const hexBytes = (bytes, max) => {
		const length = bytes.length;
		const shown = length > max ? max : length;
		let str = "";
		for (let i = 0; i < shown; i++) str += (i ? " " : "") + (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
		const remaining = length - shown;
		return remaining > 0 ? str + " ... " + remaining + " more byte" + (remaining > 1 ? "s" : "") : str;
	};
	exports.hexBytes = hexBytes;
	const classBase = (value, constructor, tag) => {
		let base = "class " + (exports.hasOwn.call(value, "name") && value.name || "(anonymous)");
		if (constructor !== "Function" && constructor !== null) base += " [" + constructor + "]";
		if (tag !== "" && constructor !== tag) base += " [" + tag + "]";
		if (constructor === null) base += " extends [null prototype]";
		else {
			const superName = Object.getPrototypeOf(value).name;
			if (superName) base += " extends " + superName;
		}
		return "[" + base + "]";
	};
	exports.classBase = classBase;
	const CLASS_REG = /^(\s+[^(]*?)\s*{/;
	const COMMENTS_REG = /(\/\/.*?\n)|(\/\*(.|\n)*?\*\/)/g;
	const BOXED = {
		"[object Number]": Number.prototype.valueOf,
		"[object String]": String.prototype.valueOf,
		"[object Boolean]": Boolean.prototype.valueOf,
		"[object BigInt]": BigInt.prototype.valueOf,
		"[object Symbol]": Symbol.prototype.valueOf
	};
	const functionBase = (value, constructor, tag, formatName) => {
		const source = Function.prototype.toString.call(value);
		if (source.startsWith("class") && source.endsWith("}")) {
			const slice = source.slice(5, -1);
			const bracket = slice.indexOf("{");
			if (bracket !== -1 && (slice.slice(0, bracket).indexOf("(") === -1 || CLASS_REG.test(slice.replace(COMMENTS_REG, "")))) return (0, exports.classBase)(value, constructor, tag);
		}
		const brand = exports.objectToString.call(value);
		let type = brand.indexOf("GeneratorFunction") === -1 ? "Function" : "GeneratorFunction";
		if (brand.indexOf("Async") !== -1) type = "Async" + type;
		let base = "[" + type;
		if (constructor === null) base += " (null prototype)";
		const name = value.name;
		base += name === "" ? " (anonymous)" : ": " + (typeof name === "string" ? name : formatName(name));
		base += "]";
		if (constructor !== type && constructor !== null) base += " " + constructor;
		if (tag !== "" && constructor !== tag) base += " [" + tag + "]";
		return base;
	};
	exports.functionBase = functionBase;
	const boxedBase = (value, keys, constructor, tag, indentation) => {
		const brand = exports.objectToString.call(value);
		const valueOf = BOXED[brand];
		if (valueOf === void 0) return;
		let primitive;
		try {
			primitive = valueOf.call(value);
		} catch {
			return;
		}
		const type = brand.slice(8, -1);
		if (type === "String") keys.splice(0, primitive.length);
		let base = "[" + type;
		if (type !== constructor) base += constructor === null ? " (null prototype)" : " (" + constructor + ")";
		base += ": " + (0, inspectPrimitive_1.formatPrimitive)(primitive, indentation) + "]";
		if (tag !== "" && tag !== constructor) base += " [" + tag + "]";
		return base;
	};
	exports.boxedBase = boxedBase;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node-utils@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node-utils/lib/inspect.js
var require_inspect = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.inspect = void 0;
	const buffer_1 = require_buffer();
	const inspectPrimitive_1 = require_inspectPrimitive();
	const inspectLayout_1 = require_inspectLayout();
	const inspectBrand_1 = require_inspectBrand();
	const INSPECT_MAX_BYTES = 50;
	const KEY_REG = /^[a-zA-Z_][a-zA-Z_0-9]*$/;
	const formatProperty = (ctx, value, recurseTimes, key, kind, desc) => {
		const descriptor = desc || (0, inspectBrand_1.getOwn)(value, key);
		let str;
		if (descriptor.value !== void 0) {
			ctx.indentationLvl += 2;
			str = formatValue(ctx, descriptor.value, recurseTimes);
			ctx.indentationLvl -= 2;
		} else if (descriptor.get !== void 0) str = descriptor.set !== void 0 ? "[Getter/Setter]" : "[Getter]";
		else str = descriptor.set !== void 0 ? "[Setter]" : "undefined";
		if (kind === 1) return str;
		let name;
		if (typeof key === "symbol") name = (0, inspectPrimitive_1.escapeString)(key.toString(), 39);
		else if (KEY_REG.test("" + key)) name = key === "__proto__" ? "['__proto__']" : "" + key;
		else name = (0, inspectPrimitive_1.quoteString)("" + key);
		if (descriptor.enumerable === false) name = "[" + name + "]";
		return name + ": " + str;
	};
	const formatExtra = (ctx, value, recurseTimes, key) => {
		let item;
		ctx.indentationLvl += 2;
		try {
			item = value[key];
		} catch {
			ctx.indentationLvl += 2;
			item = value.buffer[key];
		}
		const str = formatValue(ctx, item, recurseTimes);
		ctx.indentationLvl -= 2;
		return "[" + key + "]: " + str;
	};
	const formatSparseArray = (ctx, value, recurseTimes, maxLength, output, i) => {
		const keys = Object.keys(value);
		let index = i;
		for (; i < keys.length && output.length < maxLength; i++) {
			const key = keys[i];
			const tmp = +key;
			if (tmp > 4294967294) break;
			if ("" + index !== key) {
				if (!(0, inspectBrand_1.isIndex)(key)) break;
				const empty = tmp - index;
				output.push("<" + empty + " empty item" + (empty > 1 ? "s" : "") + ">");
				index = tmp;
				if (output.length === maxLength) break;
			}
			output.push(formatProperty(ctx, value, recurseTimes, key, 1));
			index++;
		}
		const remaining = value.length - index;
		if (output.length !== maxLength) {
			if (remaining > 0) output.push("<" + remaining + " empty item" + (remaining > 1 ? "s" : "") + ">");
		} else if (remaining > 0) output.push((0, inspectBrand_1.moreItems)(remaining));
		return output;
	};
	const formatArray = (ctx, value, recurseTimes) => {
		const length = value.length;
		const max = length < inspectLayout_1.MAX_ARRAY_LENGTH ? length : inspectLayout_1.MAX_ARRAY_LENGTH;
		const output = [];
		for (let i = 0; i < max; i++) {
			const desc = (0, inspectBrand_1.getOwn)(value, i);
			if (desc === void 0) return formatSparseArray(ctx, value, recurseTimes, max, output, i);
			output.push(formatProperty(ctx, value, recurseTimes, i, 1, desc));
		}
		if (length > max) output.push((0, inspectBrand_1.moreItems)(length - max));
		return output;
	};
	const formatTypedArray = (ctx, value) => {
		const length = inspectBrand_1.typedArrayLength.call(value);
		const max = length < inspectLayout_1.MAX_ARRAY_LENGTH ? length : inspectLayout_1.MAX_ARRAY_LENGTH;
		const output = [];
		const bigint = length > 0 && typeof value[0] !== "number";
		for (let i = 0; i < max; i++) output.push(bigint ? value[i] + "n" : (0, inspectPrimitive_1.formatNumber)(value[i]));
		if (length > max) output.push((0, inspectBrand_1.moreItems)(length - max));
		return output;
	};
	const formatSet = (ctx, value, recurseTimes) => {
		const length = inspectBrand_1.setSize.call(value);
		const max = length < inspectLayout_1.MAX_ARRAY_LENGTH ? length : inspectLayout_1.MAX_ARRAY_LENGTH;
		const output = [];
		const iterator = Set.prototype.values.call(value);
		ctx.indentationLvl += 2;
		for (let entry = iterator.next(); !entry.done && output.length < max; entry = iterator.next()) output.push(formatValue(ctx, entry.value, recurseTimes));
		if (length > max) output.push((0, inspectBrand_1.moreItems)(length - max));
		ctx.indentationLvl -= 2;
		return output;
	};
	const formatMap = (ctx, value, recurseTimes) => {
		const length = inspectBrand_1.mapSize.call(value);
		const max = length < inspectLayout_1.MAX_ARRAY_LENGTH ? length : inspectLayout_1.MAX_ARRAY_LENGTH;
		const output = [];
		const iterator = Map.prototype.entries.call(value);
		ctx.indentationLvl += 2;
		for (let entry = iterator.next(); !entry.done && output.length < max; entry = iterator.next()) output.push(formatValue(ctx, entry.value[0], recurseTimes) + " => " + formatValue(ctx, entry.value[1], recurseTimes));
		if (length > max) output.push((0, inspectBrand_1.moreItems)(length - max));
		ctx.indentationLvl -= 2;
		return output;
	};
	const formatArrayBuffer = (ctx, value) => {
		let bytes;
		try {
			bytes = new Uint8Array(value);
		} catch {
			return ["(detached)"];
		}
		return ["[Uint8Contents]: <" + (0, inspectBrand_1.hexBytes)(bytes, inspectLayout_1.MAX_ARRAY_LENGTH) + ">"];
	};
	const noEntries = () => [];
	const formatRaw = (ctx, value, recurseTimes) => {
		const constructor = (0, inspectBrand_1.constructorName)(value);
		let rawTag = "";
		try {
			rawTag = value[Symbol.toStringTag];
		} catch {}
		const tag = typeof rawTag !== "string" || rawTag !== "" && inspectBrand_1.isEnumerable.call(value, Symbol.toStringTag) ? "" : rawTag;
		let keys;
		let base = "";
		let braces = ["{", "}"];
		let formatter = noEntries;
		let kind = 0;
		let fallback = "Object";
		let extraKeys;
		if (Symbol.iterator in value || constructor === null) {
			let typed;
			if (Array.isArray(value)) {
				fallback = "Array";
				keys = (0, inspectBrand_1.nonIndexKeys)(value);
				braces = [(constructor !== "Array" || tag !== "" ? (0, inspectBrand_1.prefixOf)(constructor, tag, "Array", "(" + value.length + ")") : "") + "[", "]"];
				if (value.length === 0 && keys.length === 0) return braces[0] + "]";
				kind = 2;
				formatter = formatArray;
			} else if ((0, inspectBrand_1.hasBrand)(inspectBrand_1.setSize, value) || (0, inspectBrand_1.hasBrand)(inspectBrand_1.mapSize, value)) {
				const isSet = (0, inspectBrand_1.hasBrand)(inspectBrand_1.setSize, value);
				const size = isSet ? inspectBrand_1.setSize.call(value) : inspectBrand_1.mapSize.call(value);
				fallback = isSet ? "Set" : "Map";
				keys = (0, inspectBrand_1.ownKeys)(value);
				const prefix = (0, inspectBrand_1.prefixOf)(constructor, tag, fallback, "(" + size + ")");
				if (size === 0 && keys.length === 0) return prefix + "{}";
				braces = [prefix + "{", "}"];
				formatter = isSet ? formatSet : formatMap;
			} else if ((typed = inspectBrand_1.typedArrayTag.call(value)) !== void 0) {
				fallback = typed;
				keys = (0, inspectBrand_1.nonIndexKeys)(value);
				const length = inspectBrand_1.typedArrayLength.call(value);
				braces = [(0, inspectBrand_1.prefixOf)(constructor, tag, constructor === null ? typed : "", "(" + length + ")") + "[", "]"];
				if (length === 0 && keys.length === 0) return braces[0] + "]";
				kind = 2;
				formatter = formatTypedArray;
			}
		}
		if (keys === void 0) {
			keys = (0, inspectBrand_1.ownKeys)(value);
			if (typeof value === "function") {
				fallback = "Function";
				base = (0, inspectBrand_1.functionBase)(value, constructor, tag, (name) => formatValue(ctx, name, 0));
				if (keys.length === 0) return base;
			} else if (constructor === "Object") {
				if (inspectBrand_1.objectToString.call(value) === "[object Arguments]" && inspectBrand_1.hasOwn.call(value, "callee")) braces[0] = "[Arguments] {";
				else if (tag !== "") braces[0] = (0, inspectBrand_1.prefixOf)(constructor, tag, "Object") + "{";
				if (keys.length === 0) return braces[0] + "}";
			} else if ((0, inspectBrand_1.hasBrand)(inspectBrand_1.regExpSource, value)) {
				fallback = "RegExp";
				const prefix = (0, inspectBrand_1.prefixOf)(constructor, tag, "RegExp");
				base = RegExp.prototype.toString.call(constructor === null ? new RegExp(value) : value);
				if (prefix !== "RegExp ") base = prefix + base;
				if (keys.length === 0 || recurseTimes > ctx.depth) return base;
			} else if ((0, inspectBrand_1.hasBrand)(Date.prototype.getTime, value)) {
				fallback = "Date";
				const prefix = (0, inspectBrand_1.prefixOf)(constructor, tag, "Date");
				const time = Date.prototype.getTime.call(value);
				base = time !== time ? Date.prototype.toString.call(value) : Date.prototype.toISOString.call(value);
				if (prefix !== "Date ") base = prefix + base;
				if (keys.length === 0) return base;
			} else if (inspectBrand_1.objectToString.call(value) === "[object Error]" || (0, inspectBrand_1.isInstance)(value, Error)) {
				fallback = "Error";
				const stack = value.stack;
				base = typeof stack === "string" && stack !== "" ? stack.replace(/\n/g, "\n" + " ".repeat(ctx.indentationLvl)) : "[" + Error.prototype.toString.call(value) + "]";
				if (keys.length === 0) return base;
			} else if ((0, inspectBrand_1.hasBrand)(inspectBrand_1.arrayBufferByteLength, value) || inspectBrand_1.sharedArrayBufferByteLength !== void 0 && (0, inspectBrand_1.hasBrand)(inspectBrand_1.sharedArrayBufferByteLength, value)) {
				fallback = (0, inspectBrand_1.hasBrand)(inspectBrand_1.arrayBufferByteLength, value) ? "ArrayBuffer" : "SharedArrayBuffer";
				braces[0] = (0, inspectBrand_1.prefixOf)(constructor, tag, fallback) + "{";
				formatter = formatArrayBuffer;
				extraKeys = ["byteLength"];
			} else if ((0, inspectBrand_1.hasBrand)(inspectBrand_1.dataViewBuffer, value)) {
				fallback = "DataView";
				braces[0] = (0, inspectBrand_1.prefixOf)(constructor, tag, "DataView") + "{";
				extraKeys = [
					"byteLength",
					"byteOffset",
					"buffer"
				];
			} else {
				const boxed = (0, inspectBrand_1.boxedBase)(value, keys, constructor, tag, ctx.indentationLvl);
				if (boxed !== void 0) {
					base = boxed;
					if (keys.length === 0) return base;
				} else {
					const style = (0, inspectBrand_1.prefixOf)(constructor, tag, constructor === null ? "Object" : "");
					if (keys.length === 0) return style + "{}";
					braces[0] = style + "{";
				}
			}
		}
		if (recurseTimes > ctx.depth) {
			const name = (0, inspectBrand_1.prefixOf)(constructor, tag, constructor === null ? fallback === tag ? "Object" : fallback : "").slice(0, -1);
			return constructor === null ? name : "[" + name + "]";
		}
		recurseTimes++;
		ctx.seen.push(value);
		ctx.currentDepth = recurseTimes;
		const output = formatter(ctx, value, recurseTimes);
		if (extraKeys !== void 0) for (let i = 0; i < extraKeys.length; i++) output.push(formatExtra(ctx, value, recurseTimes, extraKeys[i]));
		for (let i = 0; i < keys.length; i++) output.push(formatProperty(ctx, value, recurseTimes, keys[i], kind));
		const index = ctx.circular === void 0 ? void 0 : ctx.circular.get(value);
		if (index !== void 0) base = base === "" ? "<ref *" + index + ">" : "<ref *" + index + "> " + base;
		ctx.seen.pop();
		return (0, inspectLayout_1.reduceToSingleString)(ctx, output, base, braces, kind, recurseTimes, value);
	};
	const formatValue = (ctx, value, recurseTimes) => {
		if (typeof value !== "object" && typeof value !== "function") return (0, inspectPrimitive_1.formatPrimitive)(value, ctx.indentationLvl);
		if (value === null) return "null";
		if (buffer_1.Buffer.isBuffer(value)) return "<" + value.constructor.name + " " + (0, inspectBrand_1.hexBytes)(value, INSPECT_MAX_BYTES) + ">";
		if (ctx.seen.indexOf(value) !== -1) {
			let circular = ctx.circular;
			if (circular === void 0) ctx.circular = circular = /* @__PURE__ */ new Map();
			let index = circular.get(value);
			if (index === void 0) {
				index = circular.size + 1;
				circular.set(value, index);
			}
			return "[Circular *" + index + "]";
		}
		return formatRaw(ctx, value, recurseTimes);
	};
	const inspect = (value, depth = 2) => formatValue({
		depth,
		indentationLvl: 0,
		currentDepth: 0,
		seen: [],
		circular: void 0
	}, value, 0);
	exports.inspect = inspect;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node-utils@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node-utils/lib/argErrors.js
var require_argErrors = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.invalidUrlScheme = exports.methodNotImplemented = exports.invalidThis = exports.outOfRange = exports.invalidArgValue = exports.invalidArgType = exports.withNativeCode = exports.withCode = void 0;
	const inspect_1 = require_inspect();
	const inspectPrimitive_1 = require_inspectPrimitive();
	const TWO_POW_32 = 4294967296;
	const BIG_TWO_POW_32 = BigInt(TWO_POW_32);
	const withCode = (error, code) => {
		error.code = code;
		const tagged = error.name + " [" + code + "]";
		Object.defineProperty(error, "name", {
			value: tagged,
			enumerable: false,
			writable: true,
			configurable: true
		});
		error.stack;
		delete error.name;
		Object.defineProperty(error, "toString", {
			value: function() {
				return tagged + ": " + this.message;
			},
			enumerable: false,
			writable: true,
			configurable: true
		});
		return error;
	};
	exports.withCode = withCode;
	const withNativeCode = (error, code) => {
		error.code = code;
		return error;
	};
	exports.withNativeCode = withNativeCode;
	const kindOf = (name) => name.indexOf(".") === -1 ? "argument" : "property";
	const describeType = (value) => {
		if (value === null) return "null";
		if (value === void 0) return "undefined";
		switch (typeof value) {
			case "bigint": return "type bigint (" + value + "n)";
			case "number": return "type number (" + (0, inspectPrimitive_1.formatNumber)(value) + ")";
			case "boolean": return "type boolean (" + value + ")";
			case "symbol": return "type symbol (" + value.toString() + ")";
			case "function": return "function " + value.name;
			case "string": {
				const str = value.length > 28 ? value.slice(0, 25) + "..." : value;
				return str.indexOf("'") === -1 ? "type string ('" + str + "')" : "type string (" + JSON.stringify(str) + ")";
			}
		}
		const ctor = value.constructor;
		return ctor && "name" in ctor ? "an instance of " + ctor.name : (0, inspect_1.inspect)(value, -1);
	};
	const describeNativeType = (value) => {
		switch (typeof value) {
			case "bigint": return "type bigint (" + value + ")";
			case "symbol": return value.toString();
			case "function": return "function";
			case "object": {
				if (value === null) break;
				const ctor = value.constructor;
				return "an instance of " + (ctor && ctor.name || "Object");
			}
		}
		return describeType(value);
	};
	const invalidArgType = (name, expected, actual, native) => {
		const head = name.endsWith(" argument") ? "The " + name + " " : "The \"" + name + "\" " + kindOf(name) + " ";
		const received = native ? describeNativeType(actual) : describeType(actual);
		const error = /* @__PURE__ */ new TypeError(head + "must be " + expected + ". Received " + received);
		return native ? (0, exports.withNativeCode)(error, "ERR_INVALID_ARG_TYPE") : (0, exports.withCode)(error, "ERR_INVALID_ARG_TYPE");
	};
	exports.invalidArgType = invalidArgType;
	const invalidArgValue = (name, value, reason = "is invalid") => {
		let inspected = (0, inspect_1.inspect)(value);
		if (inspected.length > 128) inspected = inspected.slice(0, 128) + "...";
		return (0, exports.withCode)(/* @__PURE__ */ new TypeError("The " + kindOf(name) + " '" + name + "' " + reason + ". Received " + inspected), "ERR_INVALID_ARG_VALUE");
	};
	exports.invalidArgValue = invalidArgValue;
	const outOfRange = (name, range, value, native) => {
		const message = "The value of \"" + name + "\" is out of range. It must be " + range + ". Received ";
		if (native) return (0, exports.withNativeCode)(new RangeError(message + String(value)), "ERR_OUT_OF_RANGE");
		let received;
		if (Number.isInteger(value) && Math.abs(value) > TWO_POW_32) received = (0, inspectPrimitive_1.addNumericalSeparator)("" + value);
		else if (typeof value === "bigint") {
			received = "" + value;
			if (value > BIG_TWO_POW_32 || value < -BIG_TWO_POW_32) received = (0, inspectPrimitive_1.addNumericalSeparator)(received);
			received += "n";
		} else received = (0, inspect_1.inspect)(value);
		return (0, exports.withCode)(new RangeError(message + received), "ERR_OUT_OF_RANGE");
	};
	exports.outOfRange = outOfRange;
	const invalidThis = (type) => (0, exports.withCode)(/* @__PURE__ */ new TypeError("Value of \"this\" must be of type " + type), "ERR_INVALID_THIS");
	exports.invalidThis = invalidThis;
	const methodNotImplemented = (method) => (0, exports.withCode)(/* @__PURE__ */ new Error("The " + method + " method is not implemented"), "ERR_METHOD_NOT_IMPLEMENTED");
	exports.methodNotImplemented = methodNotImplemented;
	const invalidUrlScheme = (expected) => (0, exports.withCode)(/* @__PURE__ */ new TypeError("The URL must be of scheme " + expected), "ERR_INVALID_URL_SCHEME");
	exports.invalidUrlScheme = invalidUrlScheme;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node-utils@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node-utils/lib/encoding.js
var require_encoding = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.ENCODING_UTF8 = void 0;
	exports.assertEncoding = assertEncoding;
	exports.strToEncoding = strToEncoding;
	const buffer_1 = require_buffer();
	const argErrors_1 = require_argErrors();
	exports.ENCODING_UTF8 = "utf8";
	function assertEncoding(encoding) {
		if (encoding && !buffer_1.Buffer.isEncoding(encoding)) throw (0, argErrors_1.invalidArgValue)("encoding", encoding, "is invalid encoding");
	}
	function strToEncoding(str, encoding) {
		if (!encoding || encoding === exports.ENCODING_UTF8) return str;
		if (encoding === "buffer") return new buffer_1.Buffer(str);
		return new buffer_1.Buffer(str).toString(encoding);
	}
}));
//#endregion
//#region ../../node_modules/.pnpm/glob-to-regex.js@1.3.1_tslib@2.8.1/node_modules/glob-to-regex.js/lib/index.js
var require_lib$7 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.toMatcher = exports.toRegex = exports.expandBraces = void 0;
	const NODOT = "(?!\\.)";
	const STAR = "[^/]*";
	const GLOBSTAR_NODOT = "[^/]*(?:/(?!\\.)[^/]*)*";
	const literal = (pattern, i, code) => {
		switch (code) {
			case 36:
			case 42:
			case 63:
			case 91:
			case 40:
			case 41:
			case 43:
			case 46:
			case 92:
			case 93:
			case 94:
			case 123:
			case 124:
			case 125: return "\\" + pattern[i];
			default: return pattern[i];
		}
	};
	const posixClass = (name) => {
		switch (name) {
			case "alnum": return "0-9A-Za-z";
			case "alpha": return "A-Za-z";
			case "ascii": return "\\x00-\\x7f";
			case "blank": return " \\t";
			case "cntrl": return "\\x00-\\x1f\\x7f";
			case "digit": return "0-9";
			case "graph": return "\\x21-\\x7e";
			case "lower": return "a-z";
			case "print": return "\\x20-\\x7e";
			case "punct": return "\\x21-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\x7e";
			case "space": return " \\t\\r\\n\\v\\f";
			case "upper": return "A-Z";
			case "word": return "0-9A-Za-z_";
			case "xdigit": return "0-9A-Fa-f";
		}
	};
	const classEnd = (pattern, i) => {
		const length = pattern.length;
		let j = i + 1;
		const first = pattern.charCodeAt(j);
		if (first === 33 || first === 94) j++;
		if (pattern.charCodeAt(j) === 93) j++;
		for (; j < length; j++) {
			const code = pattern.charCodeAt(j);
			if (code === 93) return j + 1;
			if (code === 91 && pattern.charCodeAt(j + 1) === 58) {
				const close = pattern.indexOf(":]", j + 2);
				if (close > 0) j = close + 1;
			}
		}
		return -1;
	};
	const member = (pattern, i) => {
		const code = pattern.charCodeAt(i);
		return (code === 93 || code === 92 || code === 91 || code === 94 || code === 45 ? "\\" : "") + pattern[i];
	};
	const classSource = (pattern, i, end) => {
		const last = end - 1;
		let j = i + 1;
		let out = "";
		let members = 0;
		const first = pattern.charCodeAt(j);
		const negate = first === 33 || first === 94;
		if (negate) j++;
		while (j < last) {
			if (pattern.charCodeAt(j) === 91 && pattern.charCodeAt(j + 1) === 58) {
				const close = pattern.indexOf(":]", j + 2);
				const cls = close > 0 ? posixClass(pattern.slice(j + 2, close)) : void 0;
				if (cls !== void 0) {
					out += cls;
					members += 2;
					j = close + 2;
					continue;
				}
			}
			if (pattern.charCodeAt(j + 1) === 45 && j + 2 < last) {
				if (pattern.charCodeAt(j + 2) >= pattern.charCodeAt(j)) {
					out += member(pattern, j) + "-" + member(pattern, j + 2);
					members += 2;
				}
				j += 3;
				continue;
			}
			out += member(pattern, j);
			members++;
			j++;
		}
		if (!negate && members === 1) return literal(pattern, last - 1, pattern.charCodeAt(last - 1));
		if (!members) return negate ? "[^/]" : "[]";
		return (negate ? "[^" : "[") + out + "]";
	};
	const groupEnd = (pattern, i) => {
		const length = pattern.length;
		let depth = 1;
		for (; i < length; i++) {
			const code = pattern.charCodeAt(i);
			if (code === 91) {
				const end = classEnd(pattern, i);
				if (end > 0) i = end - 1;
			} else if (code === 40) depth++;
			else if (code === 41 && !--depth) return i + 1;
		}
		return -1;
	};
	const splitAlts = (body) => {
		const length = body.length;
		const alts = [];
		let depth = 0;
		let from = 0;
		for (let i = 0; i < length; i++) {
			const code = body.charCodeAt(i);
			if (code === 91) {
				const end = classEnd(body, i);
				if (end > 0) i = end - 1;
			} else if (code === 40) depth++;
			else if (code === 41) depth--;
			else if (code === 124 && !depth) {
				alts.push(body.slice(from, i));
				from = i + 1;
			}
		}
		alts.push(body.slice(from));
		return alts;
	};
	const isExtglobPrefix = (code) => code === 63 || code === 42 || code === 43 || code === 64 || code === 33;
	const altsSource = (alts, extglob, nodot, tail, segStart) => {
		let out = "";
		for (let i = 0; i < alts.length; i++) out += (i ? "|" : "") + compile(alts[i], extglob, nodot, tail, segStart);
		return out;
	};
	const extglobSource = (type, alts, extglob, nodot, tail, segStart) => {
		const guard = nodot && segStart ? NODOT : "";
		const body = altsSource(alts, extglob, nodot, tail, segStart);
		switch (type) {
			case 63: return "(?:" + body + ")?";
			case 64: return "(?:" + body + ")";
			case 33:
				if (alts.length === 1 && !alts[0]) return guard + "[^/]+";
				return "(?!(?:" + body + ")" + tail + "$)" + guard + STAR;
		}
		const more = guard ? altsSource(alts, extglob, nodot, tail, false) : body;
		if (more === body) return "(?:" + body + ")" + (type === 42 ? "*" : "+");
		const once = "(?:" + body + ")(?:" + more + ")*";
		return type === 42 ? "(?:" + once + ")?" : once;
	};
	const compile = (pattern, extglob, nodot, tail, segStart) => {
		const length = pattern.length;
		let out = "";
		let i = 0;
		let start = segStart;
		while (i < length) {
			const code = pattern.charCodeAt(i);
			if (extglob && pattern.charCodeAt(i + 1) === 40 && isExtglobPrefix(code)) {
				const end = groupEnd(pattern, i + 2);
				if (end > 0) {
					const after = compile(pattern.slice(end), extglob, nodot, tail, false);
					const alts = splitAlts(pattern.slice(i + 2, end - 1));
					return out + extglobSource(code, alts, extglob, nodot, after + tail, start) + after;
				}
			}
			const atStart = start;
			const guard = nodot && atStart ? NODOT : "";
			start = false;
			switch (code) {
				case 42: {
					let j = i + 1;
					while (pattern.charCodeAt(j) === 42) j++;
					if (j === i + 1) {
						const whole = atStart && (j === length || pattern.charCodeAt(j) === 47);
						out += guard + (whole ? "[^/]+" : STAR);
						i = j;
						break;
					}
					let slash = pattern.charCodeAt(j) === 47;
					while (slash) {
						let k = j + 1;
						if (pattern.charCodeAt(k) !== 42 || pattern.charCodeAt(k + 1) !== 42) break;
						k += 2;
						while (pattern.charCodeAt(k) === 42) k++;
						if (k === length) {
							j = k;
							slash = false;
						} else if (pattern.charCodeAt(k) === 47) j = k;
						else break;
					}
					if (slash) {
						out += nodot ? "(?:" + guard + "[^/]*(?:/(?!\\.)[^/]*)*/)?" : "(?:.*/)?";
						j++;
						start = true;
					} else out += nodot ? guard + GLOBSTAR_NODOT : ".*";
					i = j;
					break;
				}
				case 63:
					out += guard + "[^/]";
					i++;
					break;
				case 91: {
					const end = classEnd(pattern, i);
					if (end < 0) {
						out += "\\[";
						i++;
						break;
					}
					const cls = classSource(pattern, i, end);
					out += (cls.charCodeAt(0) === 91 ? guard : "") + cls;
					i = end;
					break;
				}
				case 47:
					out += "/";
					i++;
					start = true;
					break;
				default:
					out += literal(pattern, i, code);
					i++;
			}
		}
		return out;
	};
	const closingBrace = (pattern, open) => {
		const length = pattern.length;
		let depth = 0;
		for (let i = open; i < length; i++) {
			const code = pattern.charCodeAt(i);
			if (code === 123) depth++;
			else if (code === 125 && !--depth) return i;
		}
		return -1;
	};
	const commaSplit = (body) => {
		const length = body.length;
		const parts = [];
		let depth = 0;
		let from = 0;
		for (let i = 0; i < length; i++) {
			const code = body.charCodeAt(i);
			if (code === 123) depth++;
			else if (code === 125) depth--;
			else if (code === 44 && !depth) {
				parts.push(body.slice(from, i));
				from = i + 1;
			}
		}
		if (!parts.length) return;
		parts.push(body.slice(from));
		return parts;
	};
	const NUMERIC_RANGE = /^(-?\d+)\.\.(-?\d+)(?:\.\.(-?\d+))?$/;
	const ALPHA_RANGE = /^([a-zA-Z])\.\.([a-zA-Z])(?:\.\.(-?\d+))?$/;
	const PADDED = /^-?0\d/;
	const rangeOf = (body, max) => {
		let match = NUMERIC_RANGE.exec(body);
		const alpha = !match;
		if (alpha) match = ALPHA_RANGE.exec(body);
		if (!match) return;
		const from = alpha ? match[1].charCodeAt(0) : +match[1];
		const to = alpha ? match[2].charCodeAt(0) : +match[2];
		const step = match[3] === void 0 ? 1 : Math.abs(+match[3]) || 1;
		const width = !alpha && (PADDED.test(match[1]) || PADDED.test(match[2])) ? Math.max(match[1].length, match[2].length) : 0;
		const out = [];
		const dir = from <= to ? step : -step;
		for (let n = from; (dir > 0 ? n <= to : n >= to) && out.length < max; n += dir) {
			if (alpha) {
				out.push(String.fromCharCode(n));
				continue;
			}
			let s = String(n);
			const need = width - s.length;
			if (need > 0) {
				let zeros = "";
				for (let k = 0; k < need; k++) zeros += "0";
				s = n < 0 ? "-" + zeros + s.slice(1) : zeros + s;
			}
			out.push(s);
		}
		return out;
	};
	const expandInto = (pattern, out, max) => {
		for (let open = pattern.indexOf("{"); open >= 0; open = pattern.indexOf("{", open + 1)) {
			const close = closingBrace(pattern, open);
			if (close < 0) continue;
			const body = pattern.slice(open + 1, close);
			const alts = commaSplit(body) || rangeOf(body, max);
			if (!alts) continue;
			const prefix = pattern.slice(0, open);
			const suffixes = (0, exports.expandBraces)(pattern.slice(close + 1), max);
			for (let i = 0; i < alts.length; i++) {
				const heads = (0, exports.expandBraces)(alts[i], max);
				for (let j = 0; j < heads.length; j++) {
					const head = prefix + heads[j];
					for (let k = 0; k < suffixes.length; k++) {
						if (out.length >= max) return;
						out.push(head + suffixes[k]);
					}
				}
			}
			return;
		}
		out.push(pattern);
	};
	const expandBraces = (pattern, max = 1e5) => {
		const out = [];
		expandInto(pattern, out, max);
		return out;
	};
	exports.expandBraces = expandBraces;
	const toRegex = (pattern, options) => {
		const extglob = !!options?.extglob;
		const nodot = options?.dot === false;
		let source;
		if (pattern.indexOf("{") < 0) source = compile(pattern, extglob, nodot, "", true);
		else {
			const set = (0, exports.expandBraces)(pattern);
			const length = set.length;
			if (length === 1) source = compile(set[0], extglob, nodot, "", true);
			else {
				const seen = /* @__PURE__ */ new Set();
				source = "(?:";
				for (let i = 0; i < length; i++) {
					const one = set[i];
					if (seen.has(one)) continue;
					if (seen.size) source += "|";
					seen.add(one);
					source += compile(one, extglob, nodot, "", true);
				}
				source += ")";
			}
		}
		return new RegExp("^" + source + "$", options?.nocase ? "i" : "");
	};
	exports.toRegex = toRegex;
	const isRegExp = /^\/(.{1,4096})\/([gimsuy]{0,6})$/;
	const toMatcher = (pattern, options) => {
		const regexes = [];
		const patterns = Array.isArray(pattern) ? pattern : [pattern];
		for (const pat of patterns) if (typeof pat === "string") {
			const match = isRegExp.exec(pat);
			if (match) {
				const [, expr, flags] = match;
				regexes.push(new RegExp(expr, flags));
			} else regexes.push((0, exports.toRegex)(pat, options));
		} else regexes.push(pat);
		return regexes.length ? new Function("p", "return " + regexes.map((r) => r + ".test(p)").join("||")) : () => false;
	};
	exports.toMatcher = toMatcher;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node-utils@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node-utils/lib/watchIgnore.js
var require_watchIgnore = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.watchIgnoreToMatcher = exports.watchIgnorePatternToMatcher = void 0;
	const glob_to_regex_js_1 = require_lib$7();
	const watchIgnorePatternToMatcher = (pattern) => {
		if (typeof pattern === "function") return pattern;
		if (pattern instanceof RegExp) return (filename) => pattern.test(filename);
		if (typeof pattern === "string") {
			const regex = (0, glob_to_regex_js_1.toRegex)(pattern);
			return (filename) => regex.test(filename);
		}
		throw new TypeError(`The "options.ignore" property must be of type string, RegExp, function, or an array thereof. Received ${typeof pattern}`);
	};
	exports.watchIgnorePatternToMatcher = watchIgnorePatternToMatcher;
	const watchIgnoreToMatcher = (ignore) => {
		if (Array.isArray(ignore)) {
			const matchers = ignore.map(exports.watchIgnorePatternToMatcher);
			return (filename) => matchers.some((matcher) => matcher(filename));
		}
		return (0, exports.watchIgnorePatternToMatcher)(ignore);
	};
	exports.watchIgnoreToMatcher = watchIgnoreToMatcher;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node-utils@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node-utils/lib/lists/fsCallbackApiList.js
var require_fsCallbackApiList = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.fsCallbackApiList = void 0;
	exports.fsCallbackApiList = [
		"access",
		"appendFile",
		"chmod",
		"chown",
		"close",
		"copyFile",
		"cp",
		"createReadStream",
		"createWriteStream",
		"exists",
		"fchmod",
		"fchown",
		"fdatasync",
		"fstat",
		"fsync",
		"ftruncate",
		"futimes",
		"glob",
		"lchmod",
		"lchown",
		"link",
		"lstat",
		"mkdir",
		"mkdtemp",
		"open",
		"openAsBlob",
		"opendir",
		"read",
		"readv",
		"readdir",
		"readFile",
		"readlink",
		"realpath",
		"rename",
		"rm",
		"rmdir",
		"stat",
		"statfs",
		"symlink",
		"truncate",
		"unlink",
		"unwatchFile",
		"utimes",
		"lutimes",
		"watch",
		"watchFile",
		"write",
		"writev",
		"writeFile"
	];
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node-utils@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node-utils/lib/lists/fsSynchronousApiList.js
var require_fsSynchronousApiList = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.fsSynchronousApiList = void 0;
	exports.fsSynchronousApiList = [
		"accessSync",
		"appendFileSync",
		"chmodSync",
		"chownSync",
		"closeSync",
		"copyFileSync",
		"cpSync",
		"existsSync",
		"fchmodSync",
		"fchownSync",
		"fdatasyncSync",
		"fstatSync",
		"fsyncSync",
		"ftruncateSync",
		"futimesSync",
		"globSync",
		"lchmodSync",
		"lchownSync",
		"linkSync",
		"lstatSync",
		"mkdirSync",
		"mkdtempSync",
		"openSync",
		"opendirSync",
		"readdirSync",
		"readFileSync",
		"readlinkSync",
		"readSync",
		"readvSync",
		"realpathSync",
		"renameSync",
		"rmdirSync",
		"rmSync",
		"statfsSync",
		"statSync",
		"symlinkSync",
		"truncateSync",
		"unlinkSync",
		"utimesSync",
		"lutimesSync",
		"writeFileSync",
		"writeSync",
		"writevSync"
	];
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node-utils@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node-utils/lib/lists/fsCommonObjectsList.js
var require_fsCommonObjectsList = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.fsCommonObjectsList = void 0;
	exports.fsCommonObjectsList = [
		"F_OK",
		"R_OK",
		"W_OK",
		"X_OK",
		"constants",
		"Stats",
		"StatFs",
		"Dir",
		"Dirent",
		"StatWatcher",
		"FSWatcher",
		"ReadStream",
		"WriteStream"
	];
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node-utils@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node-utils/lib/index.js
var require_lib$6 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.fsCommonObjectsList = exports.fsSynchronousApiList = exports.fsCallbackApiList = void 0;
	const tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
	tslib_1.__exportStar(require_types(), exports);
	tslib_1.__exportStar(require_constants$3(), exports);
	tslib_1.__exportStar(require_AMODE(), exports);
	tslib_1.__exportStar(require_FLAG(), exports);
	tslib_1.__exportStar(require_path(), exports);
	tslib_1.__exportStar(require_encoding(), exports);
	tslib_1.__exportStar(require_watchIgnore(), exports);
	var fsCallbackApiList_1 = require_fsCallbackApiList();
	Object.defineProperty(exports, "fsCallbackApiList", {
		enumerable: true,
		get: function() {
			return fsCallbackApiList_1.fsCallbackApiList;
		}
	});
	var fsSynchronousApiList_1 = require_fsSynchronousApiList();
	Object.defineProperty(exports, "fsSynchronousApiList", {
		enumerable: true,
		get: function() {
			return fsSynchronousApiList_1.fsSynchronousApiList;
		}
	});
	var fsCommonObjectsList_1 = require_fsCommonObjectsList();
	Object.defineProperty(exports, "fsCommonObjectsList", {
		enumerable: true,
		get: function() {
			return fsCommonObjectsList_1.fsCommonObjectsList;
		}
	});
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-core@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-core/lib/json.js
var require_json$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.flattenJSON = void 0;
	const buffer_1 = require_buffer();
	const fs_node_utils_1 = require_lib$6();
	const flattenJSON = (nestedJSON) => {
		const flatJSON = {};
		function flatten(pathPrefix, node) {
			for (const path in node) {
				const contentOrNode = node[path];
				const joinedPath = (0, fs_node_utils_1.pathJoin)(pathPrefix, path);
				if (typeof contentOrNode === "string" || contentOrNode instanceof buffer_1.Buffer) flatJSON[joinedPath] = contentOrNode;
				else if (typeof contentOrNode === "object" && contentOrNode !== null && !(contentOrNode instanceof buffer_1.Buffer) && Object.keys(contentOrNode).length > 0) flatten(joinedPath, contentOrNode);
				else flatJSON[joinedPath] = null;
			}
		}
		flatten("", nestedJSON);
		return flatJSON;
	};
	exports.flattenJSON = flattenJSON;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-core@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-core/lib/constants.js
var require_constants$2 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-core@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-core/lib/result.js
var require_result = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Ok = Ok;
	exports.Err = Err;
	function Ok(value) {
		return {
			ok: true,
			value
		};
	}
	function Err(err) {
		return {
			ok: false,
			err
		};
	}
}));
//#endregion
//#region ../../node_modules/.pnpm/thingies@2.6.1_tslib@2.8.1/node_modules/thingies/lib/fanout.js
var require_fanout = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.FanOut = void 0;
	var FanOut = class {
		constructor() {
			this.listeners = /* @__PURE__ */ new Set();
		}
		emit(data) {
			this.listeners.forEach((listener) => listener(data));
		}
		listen(listener) {
			const listeners = this.listeners;
			listeners.add(listener);
			return () => listeners.delete(listener);
		}
	};
	exports.FanOut = FanOut;
}));
//#endregion
//#region \0require-as-import:process
var require__require_as_import_process = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = m$3.default;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-core@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-core/lib/process.js
var require_process = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.createProcess = createProcess;
	const maybeReturnProcess = () => {
		if (typeof process !== "undefined") return process;
		try {
			return require__require_as_import_process();
		} catch {
			return;
		}
	};
	function createProcess() {
		const p = maybeReturnProcess() || {};
		if (!p.cwd) p.cwd = () => "/";
		if (!p.emitWarning) p.emitWarning = (message, type) => {
			console.warn(`${type}${type ? ": " : ""}${message}`);
		};
		if (!p.env) p.env = {};
		return p;
	}
	exports.default = createProcess();
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-core@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-core/lib/Node.js
var require_Node = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Node = void 0;
	const fanout_1 = require_fanout();
	const process_1 = require_process();
	const buffer_1 = require_buffer();
	const { S_IFMT, S_IFDIR, S_IFREG, S_IFLNK, S_IFCHR } = require_lib$6().constants;
	const getuid = () => process_1.default.getuid?.() ?? 0;
	const getgid = () => process_1.default.getgid?.() ?? 0;
	const EMPTY_BUFFER = (0, buffer_1.bufferAllocUnsafe)(0);
	var Node = class {
		constructor(ino, mode = 438, uid = getuid(), gid = getgid()) {
			this.changes = new fanout_1.FanOut();
			this._uid = getuid();
			this._gid = getgid();
			this._atime = /* @__PURE__ */ new Date();
			this._mtime = /* @__PURE__ */ new Date();
			this._ctime = /* @__PURE__ */ new Date();
			this._btime = /* @__PURE__ */ new Date();
			this.buf = EMPTY_BUFFER;
			this.capacity = 0;
			this.size = 0;
			this.rdev = 0;
			this._nlink = 1;
			this.mode = mode;
			this.ino = ino;
			this._uid = uid;
			this._gid = gid;
		}
		set ctime(ctime) {
			this._ctime = ctime;
		}
		get ctime() {
			return this._ctime;
		}
		set btime(btime) {
			this._btime = btime;
		}
		get btime() {
			return this._btime;
		}
		set uid(uid) {
			this._uid = uid;
			this.ctime = /* @__PURE__ */ new Date();
		}
		get uid() {
			return this._uid;
		}
		set gid(gid) {
			this._gid = gid;
			this.ctime = /* @__PURE__ */ new Date();
		}
		get gid() {
			return this._gid;
		}
		set atime(atime) {
			this._atime = atime;
		}
		get atime() {
			return this._atime;
		}
		set mtime(mtime) {
			this._mtime = mtime;
			this.ctime = /* @__PURE__ */ new Date();
		}
		get mtime() {
			return this._mtime;
		}
		get perm() {
			return this.mode & ~S_IFMT;
		}
		set perm(perm) {
			this.mode = this.mode & S_IFMT | perm & ~S_IFMT;
			this.ctime = /* @__PURE__ */ new Date();
		}
		set nlink(nlink) {
			this._nlink = nlink;
			this.ctime = /* @__PURE__ */ new Date();
		}
		get nlink() {
			return this._nlink;
		}
		getString(encoding = "utf8") {
			this.atime = /* @__PURE__ */ new Date();
			return this.getBuffer().toString(encoding);
		}
		setString(str) {
			this._setBuf((0, buffer_1.bufferFrom)(str, "utf8"));
		}
		getBuffer() {
			this.atime = /* @__PURE__ */ new Date();
			if (!this.buf) this.buf = (0, buffer_1.bufferAllocUnsafe)(0);
			return (0, buffer_1.bufferFrom)(this.buf.subarray(0, this.size));
		}
		setBuffer(buf) {
			const copy = (0, buffer_1.bufferFrom)(buf);
			this._setBuf(copy);
		}
		_setBuf(buf) {
			const size = buf.length;
			this.buf = buf;
			this.capacity = size;
			this.size = size;
			this.touch();
		}
		getSize() {
			return this.size;
		}
		setModeProperty(property) {
			this.mode = property;
		}
		isFile() {
			return (this.mode & S_IFMT) === S_IFREG;
		}
		isDirectory() {
			return (this.mode & S_IFMT) === S_IFDIR;
		}
		isSymlink() {
			return (this.mode & S_IFMT) === S_IFLNK;
		}
		isCharacterDevice() {
			return (this.mode & S_IFMT) === S_IFCHR;
		}
		makeSymlink(symlink) {
			this.mode = S_IFLNK | 438;
			this.symlink = symlink;
		}
		write(buf, off = 0, len = buf.length, pos = 0) {
			const bufLength = buf.length;
			if (off + len > bufLength) len = bufLength - off;
			if (len <= 0) return 0;
			const requiredSize = pos + len;
			if (requiredSize > this.capacity) {
				let newCapacity = Math.max(this.capacity * 2, 64);
				while (newCapacity < requiredSize) newCapacity *= 2;
				const newBuf = (0, buffer_1.bufferAllocUnsafe)(newCapacity);
				if (this.size > 0) this.buf.copy(newBuf, 0, 0, this.size);
				this.buf = newBuf;
				this.capacity = newCapacity;
			}
			if (pos > this.size) this.buf.fill(0, this.size, pos);
			buf.copy(this.buf, pos, off, off + len);
			if (requiredSize > this.size) this.size = requiredSize;
			this.touch();
			return len;
		}
		read(buf, off = 0, len = buf.byteLength, pos = 0) {
			this.atime = /* @__PURE__ */ new Date();
			if (pos >= this.size) return 0;
			let actualLen = len;
			if (actualLen > buf.byteLength) actualLen = buf.byteLength;
			if (actualLen + pos > this.size) actualLen = this.size - pos;
			if (actualLen <= 0) return 0;
			const buf2 = buf instanceof buffer_1.Buffer ? buf : buffer_1.Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
			this.buf.copy(buf2, off, pos, pos + actualLen);
			return actualLen;
		}
		truncate(len = 0) {
			if (len <= 0) {
				this.buf = EMPTY_BUFFER;
				this.capacity = 0;
				this.size = 0;
				this.touch();
				return;
			}
			if (len <= this.size) this.size = len;
			else {
				if (len > this.capacity) {
					let newCapacity = Math.max(this.capacity * 2, 64);
					while (newCapacity < len) newCapacity *= 2;
					const buf = (0, buffer_1.bufferAllocUnsafe)(newCapacity);
					if (this.size > 0) this.buf.copy(buf, 0, 0, this.size);
					buf.fill(0, this.size, len);
					this.buf = buf;
					this.capacity = newCapacity;
				} else this.buf.fill(0, this.size, len);
				this.size = len;
			}
			this.touch();
		}
		chmod(perm) {
			this.mode = this.mode & S_IFMT | perm & ~S_IFMT;
			this.touch();
		}
		chown(uid, gid) {
			this.uid = uid;
			this.gid = gid;
			this.touch();
		}
		touch() {
			this.mtime = /* @__PURE__ */ new Date();
			this.changes.emit(["modify"]);
		}
		canRead(uid = getuid(), gid = getgid()) {
			if (this.perm & 4) return true;
			if (gid === this.gid) {
				if (this.perm & 32) return true;
			}
			if (uid === this.uid) {
				if (this.perm & 256) return true;
			}
			return false;
		}
		canWrite(uid = getuid(), gid = getgid()) {
			if (this.perm & 2) return true;
			if (gid === this.gid) {
				if (this.perm & 16) return true;
			}
			if (uid === this.uid) {
				if (this.perm & 128) return true;
			}
			return false;
		}
		canExecute(uid = getuid(), gid = getgid()) {
			if (this.perm & 1) return true;
			if (gid === this.gid) {
				if (this.perm & 8) return true;
			}
			if (uid === this.uid) {
				if (this.perm & 64) return true;
			}
			return false;
		}
		del() {
			this.changes.emit(["delete"]);
		}
		toJSON() {
			return {
				ino: this.ino,
				uid: this.uid,
				gid: this.gid,
				atime: this.atime.getTime(),
				mtime: this.mtime.getTime(),
				ctime: this.ctime.getTime(),
				btime: this.btime.getTime(),
				perm: this.perm,
				mode: this.mode,
				nlink: this.nlink,
				symlink: this.symlink,
				data: this.getString()
			};
		}
	};
	exports.Node = Node;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-core@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-core/lib/Link.js
var require_Link = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Link = void 0;
	const fs_node_utils_1 = require_lib$6();
	const fanout_1 = require_fanout();
	const { S_IFREG } = fs_node_utils_1.constants;
	exports.Link = class Link {
		get steps() {
			return this._steps;
		}
		set steps(val) {
			this._steps = val;
			for (const [child, link] of this.children.entries()) {
				if (child === "." || child === "..") continue;
				link?.syncSteps();
			}
		}
		constructor(vol, parent, name) {
			this.changes = new fanout_1.FanOut();
			this.children = /* @__PURE__ */ new Map();
			this._steps = [];
			this.ino = 0;
			this.length = 0;
			this.vol = vol;
			this.parent = parent;
			this.name = name;
			this.syncSteps();
		}
		setNode(node) {
			this.node = node;
			this.ino = node.ino;
		}
		getNode() {
			return this.node;
		}
		createChild(name, node = this.vol.createNode(S_IFREG | 438)) {
			const link = new Link(this.vol, this, name);
			link.setNode(node);
			if (node.isDirectory()) {
				link.children.set(".", link);
				link.getNode().nlink++;
			}
			this.setChild(name, link);
			return link;
		}
		setChild(name, link = new Link(this.vol, this, name)) {
			this.children.set(name, link);
			link.parent = this;
			this.length++;
			if (link.getNode().isDirectory()) {
				link.children.set("..", this);
				this.getNode().nlink++;
			}
			this.getNode().mtime = /* @__PURE__ */ new Date();
			this.changes.emit([
				"child:add",
				link,
				this
			]);
			return link;
		}
		deleteChild(link) {
			if (link.getNode().isDirectory()) {
				link.children.delete("..");
				this.getNode().nlink--;
			}
			this.children.delete(link.getName());
			this.length--;
			this.getNode().mtime = /* @__PURE__ */ new Date();
			this.changes.emit([
				"child:del",
				link,
				this
			]);
		}
		getChild(name) {
			this.getNode().atime = /* @__PURE__ */ new Date();
			return this.children.get(name);
		}
		getPath() {
			return this.steps.join("/");
		}
		getParentPath() {
			const parent = this.steps.slice(0, -1).join("/");
			return parent ? parent : "/";
		}
		getName() {
			return this.steps[this.steps.length - 1];
		}
		toJSON() {
			return {
				steps: this.steps,
				ino: this.ino,
				children: Array.from(this.children.keys())
			};
		}
		syncSteps() {
			this.steps = this.parent ? this.parent.steps.concat([this.name]) : [this.name];
		}
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-core@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-core/lib/File.js
var require_File = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.File = void 0;
	const { O_APPEND } = require_lib$6().constants;
	var File = class {
		constructor(link, node, flags, fd) {
			this.link = link;
			this.node = node;
			this.flags = flags;
			this.fd = fd;
			this.position = 0;
		}
		getString(encoding = "utf8") {
			return this.node.getString();
		}
		setString(str) {
			this.node.setString(str);
		}
		getBuffer() {
			return this.node.getBuffer();
		}
		setBuffer(buf) {
			this.node.setBuffer(buf);
		}
		getSize() {
			return this.node.getSize();
		}
		truncate(len) {
			this.node.truncate(len);
		}
		seekTo(position) {
			this.position = position;
		}
		write(buf, offset = 0, length = buf.length, position) {
			const append = !!(this.flags & O_APPEND);
			const explicit = !append && typeof position === "number";
			const pos = append ? this.node.getSize() : explicit ? position : this.position;
			const bytes = this.node.write(buf, offset, length, pos);
			if (!explicit) this.position = pos + bytes;
			return bytes;
		}
		read(buf, offset = 0, length = buf.byteLength, position) {
			const explicit = typeof position === "number";
			const pos = explicit ? position : this.position;
			const bytes = this.node.read(buf, offset, length, pos);
			if (!explicit) this.position = pos + bytes;
			return bytes;
		}
		chmod(perm) {
			this.node.chmod(perm);
		}
		chown(uid, gid) {
			this.node.chown(uid, gid);
		}
	};
	exports.File = File;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node-utils@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node-utils/lib/validators.js
var require_validators = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.validateAbortSignal = exports.validateBuffer = exports.validateStringArray = exports.validateArray = exports.validateOneOf = exports.validateObject = exports.validateFunction = exports.validateBoolean = exports.validateString = exports.validateUint32 = exports.validateInt32 = exports.validateInteger = exports.INT32_MAX = void 0;
	const argErrors_1 = require_argErrors();
	exports.INT32_MAX = 2147483647;
	const INT32_MIN = -2147483648;
	const UINT32_MAX = 4294967295;
	const MAX_SAFE = 9007199254740991;
	const validateRange = (value, name, min, max) => {
		if (typeof value !== "number") throw (0, argErrors_1.invalidArgType)(name, "of type number", value);
		if (!Number.isInteger(value)) throw (0, argErrors_1.outOfRange)(name, "an integer", value);
		if (value < min || value > max) throw (0, argErrors_1.outOfRange)(name, ">= " + min + " && <= " + max, value);
	};
	const validateInteger = (value, name, min = -9007199254740991, max = MAX_SAFE) => validateRange(value, name, min, max);
	exports.validateInteger = validateInteger;
	const validateInt32 = (value, name, min = INT32_MIN, max = exports.INT32_MAX) => validateRange(value, name, min, max);
	exports.validateInt32 = validateInt32;
	const validateUint32 = (value, name, positive) => validateRange(value, name, positive ? 1 : 0, UINT32_MAX);
	exports.validateUint32 = validateUint32;
	const validateString = (value, name) => {
		if (typeof value !== "string") throw (0, argErrors_1.invalidArgType)(name, "of type string", value);
	};
	exports.validateString = validateString;
	const validateBoolean = (value, name) => {
		if (typeof value !== "boolean") throw (0, argErrors_1.invalidArgType)(name, "of type boolean", value);
	};
	exports.validateBoolean = validateBoolean;
	const validateFunction = (value, name) => {
		if (typeof value !== "function") throw (0, argErrors_1.invalidArgType)(name, "of type function", value);
	};
	exports.validateFunction = validateFunction;
	const validateObject = (value, name, options = 0) => {
		if (value === null && !(options & 1) || Array.isArray(value) && !(options & 2) || value !== null && typeof value !== "object" && (typeof value !== "function" || !(options & 4))) throw (0, argErrors_1.invalidArgType)(name, "of type object", value);
	};
	exports.validateObject = validateObject;
	const validateOneOf = (value, name, oneOf) => {
		if (oneOf.includes(value)) return;
		let allowed = "";
		for (let i = 0; i < oneOf.length; i++) {
			const one = oneOf[i];
			allowed += (i ? ", " : "") + (typeof one === "string" ? "'" + one + "'" : String(one));
		}
		throw (0, argErrors_1.invalidArgValue)(name, value, "must be one of: " + allowed);
	};
	exports.validateOneOf = validateOneOf;
	const validateArray = (value, name, minLength = 0) => {
		if (!Array.isArray(value)) throw (0, argErrors_1.invalidArgType)(name, "an instance of Array", value);
		if (value.length < minLength) throw (0, argErrors_1.invalidArgValue)(name, value, "must have a length of at least " + minLength);
	};
	exports.validateArray = validateArray;
	const validateStringArray = (value, name) => {
		(0, exports.validateArray)(value, name);
		const array = value;
		for (let i = 0; i < array.length; i++) if (typeof array[i] !== "string") throw (0, argErrors_1.invalidArgType)(name + "[" + i + "]", "of type string", array[i]);
	};
	exports.validateStringArray = validateStringArray;
	const validateBuffer = (buffer, name = "buffer") => {
		if (!ArrayBuffer.isView(buffer)) throw (0, argErrors_1.invalidArgType)(name, "an instance of Buffer, TypedArray, or DataView", buffer);
	};
	exports.validateBuffer = validateBuffer;
	const validateAbortSignal = (signal, name) => {
		if (signal !== void 0 && (signal === null || typeof signal !== "object" || !("aborted" in signal))) throw (0, argErrors_1.invalidArgType)(name, "an instance of AbortSignal", signal);
	};
	exports.validateAbortSignal = validateAbortSignal;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-core@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-core/lib/util.js
var require_util$3 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.filenameToSteps = exports.resolve = exports.unixify = exports.isWin = void 0;
	exports.isFd = isFd;
	exports.validateFd = validateFd;
	exports.dataToBuffer = dataToBuffer;
	exports.nullCheck = nullCheck;
	exports.pathToFilename = pathToFilename;
	const path_1 = require_path$1();
	const buffer_1 = require_buffer();
	const process_1 = require_process();
	const fs_node_utils_1 = require_lib$6();
	const argErrors_1 = require_argErrors();
	const validators_1 = require_validators();
	exports.isWin = process_1.default.platform === "win32";
	const resolveCrossPlatform = path_1.resolve;
	const isSeparator = (str, i) => {
		let char = str[i];
		return i > 0 && (char === "/" || exports.isWin && char === "\\");
	};
	const removeTrailingSeparator = (str) => {
		let i = str.length - 1;
		if (i < 2) return str;
		while (isSeparator(str, i)) i--;
		return str.substr(0, i + 1);
	};
	const normalizePath = (str, stripTrailing) => {
		if (typeof str !== "string") throw new TypeError("expected a string");
		str = str.replace(/[\\\/]+/g, "/");
		if (stripTrailing !== false) str = removeTrailingSeparator(str);
		return str;
	};
	const unixify = (filepath, stripTrailing = true) => {
		if (exports.isWin) {
			filepath = normalizePath(filepath, stripTrailing);
			return filepath.replace(/^([a-zA-Z]+:|\.\/)/, "");
		}
		return filepath;
	};
	exports.unixify = unixify;
	let resolve = (filename, base = process_1.default.cwd()) => resolveCrossPlatform(base, filename);
	exports.resolve = resolve;
	if (exports.isWin) {
		const _resolve = resolve;
		exports.resolve = resolve = (filename, base) => (0, exports.unixify)(_resolve(filename, base));
	}
	const filenameToSteps = (filename, base) => {
		const fullPathSansSlash = resolve(filename, base).substring(1);
		if (!fullPathSansSlash) return [];
		return fullPathSansSlash.split(fs_node_utils_1.pathSep);
	};
	exports.filenameToSteps = filenameToSteps;
	function isFd(path) {
		return path >>> 0 === path;
	}
	function validateFd(fd) {
		if (typeof fd !== "number") throw (0, argErrors_1.invalidArgType)("fd", "of type number", fd, true);
		if ((fd < 0 || fd > validators_1.INT32_MAX) && fd !== Infinity && fd !== -Infinity) throw (0, argErrors_1.outOfRange)("fd", ">= 0 && <= " + validators_1.INT32_MAX, fd, true);
		if (!Number.isInteger(fd)) throw (0, argErrors_1.outOfRange)("fd", "an integer", fd, true);
	}
	function dataToBuffer(data, encoding = fs_node_utils_1.ENCODING_UTF8) {
		if (buffer_1.Buffer.isBuffer(data)) return data;
		else if (data instanceof Uint8Array) return (0, buffer_1.bufferFrom)(data);
		else if (encoding === "buffer") return (0, buffer_1.bufferFrom)(String(data), "utf8");
		else return (0, buffer_1.bufferFrom)(String(data), encoding);
	}
	const NO_NULL_BYTES = "must be a string, Uint8Array, or URL without null bytes";
	const checkNullByte = (path, name, received) => {
		if (path.indexOf("\0") === -1) return;
		throw (0, argErrors_1.invalidArgValue)(name, received, NO_NULL_BYTES);
	};
	function nullCheck(path, name = "path") {
		if (path instanceof Uint8Array) {
			for (let i = 0; i < path.length; i++) if (!path[i]) throw (0, argErrors_1.invalidArgValue)(name, path, NO_NULL_BYTES);
			return true;
		}
		const str = "" + path;
		checkNullByte(str, name, str);
		return true;
	}
	const isURL = (value) => !!value && !!value.href && !!value.protocol && value.auth === void 0 && value.path === void 0;
	const getPathFromURL = (url) => {
		if (url.protocol !== "file:") throw (0, argErrors_1.invalidUrlScheme)("file");
		if (url.hostname !== "") throw (0, argErrors_1.withCode)(/* @__PURE__ */ new TypeError("File URL host must be \"localhost\" or empty on " + process_1.default.platform), "ERR_INVALID_FILE_URL_HOST");
		const pathname = url.pathname;
		for (let n = 0; n < pathname.length; n++) if (pathname[n] === "%") {
			const third = pathname.codePointAt(n + 2) | 32;
			if (pathname[n + 1] === "2" && third === 102) throw (0, argErrors_1.withCode)(/* @__PURE__ */ new TypeError("File URL path must not include encoded / characters"), "ERR_INVALID_FILE_URL_PATH");
		}
		const filepath = decodeURIComponent(pathname);
		return exports.isWin ? filepath.replace(/^\/([a-zA-Z]:)/, "$1") : filepath;
	};
	function pathToFilename(path, name = "path") {
		const received = path;
		if (path instanceof Uint8Array) path = (0, buffer_1.bufferFrom)(path);
		if (typeof path !== "string" && !buffer_1.Buffer.isBuffer(path)) {
			if (!isURL(path)) throw (0, argErrors_1.invalidArgType)(name, "of type string or an instance of Buffer or URL", path);
			path = getPathFromURL(path);
		}
		const pathString = String(path);
		checkNullByte(pathString, name, received instanceof Uint8Array ? received : pathString);
		return pathString;
	}
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-core@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-core/lib/SystemError.js
var require_SystemError = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.SystemError = void 0;
	var SystemError = class extends Error {
		constructor(code, prefix, info) {
			const path = info.path;
			const dest = info.dest;
			let message = prefix + ": " + info.syscall + " returned " + info.code + " (" + info.message + ")";
			if (path !== void 0) message += " " + path;
			if (dest !== void 0) message += " => " + dest;
			super(message);
			this.code = code;
			this.info = info;
			this.errno = info.errno;
			this.syscall = info.syscall;
			if (path !== void 0) this.path = path;
			if (dest !== void 0) this.dest = dest;
		}
		toString() {
			return this.name + " [" + this.code + "]: " + this.message;
		}
	};
	exports.SystemError = SystemError;
	SystemError.prototype.name = "SystemError";
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-core@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-core/lib/errors.js
var require_errors = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.createEisdirError = exports.createWatchError = exports.createStatError = exports.createError = void 0;
	const SystemError_1 = require_SystemError();
	const UV = {
		EPERM: [-1, "operation not permitted"],
		ENOENT: [-2, "no such file or directory"],
		EIO: [-5, "i/o error"],
		EBADF: [-9, "bad file descriptor"],
		EAGAIN: [-11, "resource temporarily unavailable"],
		EACCES: [-13, "permission denied"],
		EBUSY: [-16, "resource busy or locked"],
		EEXIST: [-17, "file already exists"],
		EXDEV: [-18, "cross-device link not permitted"],
		ENOTDIR: [-20, "not a directory"],
		EISDIR: [-21, "illegal operation on a directory"],
		EINVAL: [-22, "invalid argument"],
		ENFILE: [-23, "file table overflow"],
		EMFILE: [-24, "too many open files"],
		ETXTBSY: [-26, "text file is busy"],
		EFBIG: [-27, "file too large"],
		ENOSPC: [-28, "no space left on device"],
		ESPIPE: [-29, "invalid seek"],
		EROFS: [-30, "read-only file system"],
		EMLINK: [-31, "too many links"],
		ERANGE: [-34, "result too large"],
		ENAMETOOLONG: [-36, "name too long"],
		ENOSYS: [-38, "function not implemented"],
		ENOTEMPTY: [-39, "directory not empty"],
		ELOOP: [-40, "too many symbolic links encountered"],
		EPROTO: [-71, "protocol error"],
		EOVERFLOW: [-75, "value too large for defined data type"],
		ENOTSUP: [-95, "operation not supported on socket"]
	};
	const formatMessage = (code, uv, syscall, path, dest) => {
		let message = code + ": " + (uv ? uv[1] : "unknown error") + ", " + syscall;
		if (path) message += " '" + path + "'";
		if (dest) message += " -> '" + dest + "'";
		return message;
	};
	const createError = (code, syscall = "", path = "", dest = "", Constructor = Error) => {
		const uv = UV[code];
		const error = new Constructor(formatMessage(code, uv, syscall, path, dest));
		if (uv) error.errno = uv[0];
		error.code = code;
		error.syscall = syscall;
		if (path) error.path = path;
		if (dest) error.dest = dest;
		return error;
	};
	exports.createError = createError;
	const createStatError = (code, syscall = "", path = "", dest = "") => {
		const uv = UV[code];
		return {
			errno: uv ? uv[0] : void 0,
			code,
			syscall,
			path,
			dest,
			message: formatMessage(code, uv, syscall, path, dest),
			toError: () => (0, exports.createError)(code, syscall, path, dest)
		};
	};
	exports.createStatError = createStatError;
	const createWatchError = (code, filename) => {
		const uv = UV[code];
		const error = new Error(formatMessage(code, uv, "watch", filename, ""));
		if (uv) error.errno = uv[0];
		error.syscall = "watch";
		error.code = code;
		error.path = filename;
		error.filename = filename;
		return error;
	};
	exports.createWatchError = createWatchError;
	const createEisdirError = (syscall, path) => new SystemError_1.SystemError("ERR_FS_EISDIR", "Path is a directory", {
		code: "EISDIR",
		message: "is a directory",
		path,
		syscall,
		errno: -UV.EISDIR[0]
	});
	exports.createEisdirError = createEisdirError;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-core@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-core/lib/watch/FsEvent.js
var require_FsEvent = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.FsEvent = void 0;
	var FsEvent = class {
		constructor(type, steps, node, link, oldSteps = void 0) {
			this.type = type;
			this.steps = steps;
			this.node = node;
			this.link = link;
			this.oldSteps = oldSteps;
		}
	};
	exports.FsEvent = FsEvent;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-core@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-core/lib/Superblock.js
var require_Superblock = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Superblock = void 0;
	const path_1 = require_path$1();
	const Node_1 = require_Node();
	const Link_1 = require_Link();
	const File_1 = require_File();
	const buffer_1 = require_buffer();
	const process_1 = require_process();
	const fs_node_utils_1 = require_lib$6();
	const fs_node_utils_2 = require_lib$6();
	const util_1 = require_util$3();
	const errors_1 = require_errors();
	const argErrors_1 = require_argErrors();
	const json_1 = require_json$1();
	const result_1 = require_result();
	const fanout_1 = require_fanout();
	const FsEvent_1 = require_FsEvent();
	const { O_RDONLY, O_WRONLY, O_RDWR, O_CREAT, O_EXCL, O_TRUNC, O_DIRECTORY, O_NOFOLLOW } = fs_node_utils_1.constants;
	const MAX_SYMLINK_HOPS = 40;
	const endsWithSep = (path, win32) => {
		let i = path.length - 1;
		if (i < 1) return false;
		let code = path.charCodeAt(i);
		if (code === 46) code = path.charCodeAt(--i);
		return code === 47 || win32 && code === 92;
	};
	var Superblock = class Superblock {
		static fromJSON(json, cwd, opts) {
			const vol = new Superblock(opts);
			vol.fromJSON(json, cwd);
			return vol;
		}
		static fromNestedJSON(json, cwd, opts) {
			const vol = new Superblock(opts);
			vol.fromNestedJSON(json, cwd);
			return vol;
		}
		constructor(opts = {}) {
			this.ino = 0;
			this.inodes = {};
			this.releasedInos = [];
			this.fds = {};
			this.releasedFds = [];
			this.maxFiles = 1e4;
			this.openFiles = 0;
			this.changes = new fanout_1.FanOut();
			this.open = (filename, flagsNum, modeNum, resolveSymlinks = true) => {
				const file = this.openFile(filename, flagsNum, modeNum, resolveSymlinks);
				if (!file) throw (0, errors_1.createError)("ENOENT", "open", filename);
				return file.fd;
			};
			this.writeFile = (id, buf, flagsNum, modeNum) => {
				const isUserFd = typeof id === "number";
				let fd;
				if (isUserFd) fd = id;
				else fd = this.open((0, util_1.pathToFilename)(id), flagsNum, modeNum);
				let offset = 0;
				let length = buf.length;
				try {
					while (length > 0) {
						const written = this.write(fd, buf, offset, length, null);
						offset += written;
						length -= written;
					}
				} finally {
					if (!isUserFd) this.close(fd);
				}
			};
			this.read = (fd, buffer, offset, length, position) => {
				if (offset < 0) throw (0, argErrors_1.outOfRange)("offset", ">= 0 && <= 9007199254740991", offset);
				if (length === 0) return 0;
				if (length < 0) throw (0, argErrors_1.outOfRange)("length", ">= 0", length);
				if (offset + length > buffer.byteLength) throw (0, argErrors_1.outOfRange)("length", "<= " + (buffer.byteLength - offset), length);
				const file = this.getFileByFdOrThrow(fd, "read");
				if (file.node.isSymlink()) throw (0, errors_1.createError)("EPERM", "read", file.link.getPath());
				return file.read(buffer, Number(offset), Number(length), position === -1 || typeof position !== "number" ? void 0 : position);
			};
			this.readv = (fd, buffers, position) => {
				const file = this.getFileByFdOrThrow(fd, "read");
				let p = position ?? void 0;
				if (p === -1) p = void 0;
				let bytesRead = 0;
				for (const buffer of buffers) {
					const bytes = file.read(buffer, 0, buffer.byteLength, p);
					if (p !== void 0) p += bytes;
					bytesRead += bytes;
					if (bytes < buffer.byteLength) break;
				}
				return bytesRead;
			};
			this.link = (filename1, filename2) => {
				let link1;
				try {
					link1 = this.getLinkOrThrow(filename1, "link");
				} catch (err) {
					if (err.code) err = (0, errors_1.createError)(err.code, "link", filename1, filename2);
					throw err;
				}
				const dirname2 = (0, path_1.dirname)(filename2);
				let dir2;
				try {
					dir2 = this.getLinkOrThrow(dirname2, "link");
				} catch (err) {
					if (err.code) err = (0, errors_1.createError)(err.code, "link", filename1, filename2);
					throw err;
				}
				const name = (0, path_1.basename)(filename2);
				if (dir2.getChild(name)) throw (0, errors_1.createError)("EEXIST", "link", filename1, filename2);
				const node = link1.getNode();
				node.nlink++;
				const newLink = dir2.createChild(name, node);
				this.emit(new FsEvent_1.FsEvent(0, newLink.steps, node, newLink));
			};
			this.unlink = (filename) => {
				const link = this.getLinkOrThrow(filename, "unlink");
				if (link.getNode().isDirectory()) throw (0, errors_1.createError)("EPERM", "unlink", filename);
				this._emitDeleteRecursive(link);
				this.deleteLink(link);
				const node = link.getNode();
				node.nlink--;
				if (node.nlink <= 0) this.deleteNode(node);
			};
			this.symlink = (targetFilename, pathFilename) => {
				if (!targetFilename) throw (0, errors_1.createError)("ENOENT", "symlink", targetFilename, pathFilename);
				const pathSteps = this.filenameToSteps(pathFilename);
				let dirLink;
				try {
					dirLink = this.getLinkParentAsDirOrThrow(pathSteps);
				} catch (err) {
					if (err.code) err = (0, errors_1.createError)(err.code, "symlink", targetFilename, pathFilename);
					throw err;
				}
				const name = pathSteps[pathSteps.length - 1];
				if (dirLink.getChild(name)) throw (0, errors_1.createError)("EEXIST", "symlink", targetFilename, pathFilename);
				const node = dirLink.getNode();
				if (!node.canExecute() || !node.canWrite()) throw (0, errors_1.createError)("EACCES", "symlink", targetFilename, pathFilename);
				const symlink = dirLink.createChild(name);
				symlink.getNode().makeSymlink(targetFilename);
				this.emit(new FsEvent_1.FsEvent(0, symlink.steps, symlink.getNode(), symlink));
				return symlink;
			};
			this.rename = (oldPathFilename, newPathFilename) => {
				let link;
				try {
					link = this.getResolvedLinkOrThrow(oldPathFilename);
				} catch (err) {
					if (err.code) err = (0, errors_1.createError)(err.code, "rename", oldPathFilename, newPathFilename);
					throw err;
				}
				let newPathDirLink;
				try {
					newPathDirLink = this.getLinkParentAsDirOrThrow(newPathFilename);
				} catch (err) {
					if (err.code) err = (0, errors_1.createError)(err.code, "rename", oldPathFilename, newPathFilename);
					throw err;
				}
				const oldLinkParent = link.parent;
				if (!oldLinkParent) throw (0, errors_1.createError)("EINVAL", "rename", oldPathFilename, newPathFilename);
				const oldParentNode = oldLinkParent.getNode();
				const newPathDirNode = newPathDirLink.getNode();
				if (!oldParentNode.canExecute() || !oldParentNode.canWrite() || !newPathDirNode.canExecute() || !newPathDirNode.canWrite()) throw (0, errors_1.createError)("EACCES", "rename", oldPathFilename, newPathFilename);
				oldLinkParent.deleteChild(link);
				const name = (0, path_1.basename)(newPathFilename);
				const oldSteps = link.steps;
				link.name = name;
				link.steps = [...newPathDirLink.steps, name];
				newPathDirLink.setChild(link.getName(), link);
				this.emit(new FsEvent_1.FsEvent(4, link.steps, link.getNode(), link, oldSteps));
			};
			this.mkdir = (filename, modeNum) => {
				const steps = this.filenameToSteps(filename);
				if (!steps.length) throw (0, errors_1.createError)("EEXIST", "mkdir", filename);
				const dir = this.getLinkParentAsDirOrThrow(filename, "mkdir");
				const name = steps[steps.length - 1];
				if (dir.getChild(name)) throw (0, errors_1.createError)("EEXIST", "mkdir", filename);
				const node = dir.getNode();
				if (!node.canWrite() || !node.canExecute()) throw (0, errors_1.createError)("EACCES", "mkdir", filename);
				const child = dir.createChild(name, this.createNode(fs_node_utils_1.constants.S_IFDIR | modeNum));
				this.emit(new FsEvent_1.FsEvent(0, child.steps, child.getNode(), child));
			};
			this.mkdirp = (filename, modeNum) => {
				let created = false;
				const steps = this.filenameToSteps(filename);
				let curr = null;
				let i = steps.length;
				for (i = steps.length; i >= 0; i--) {
					curr = this.getResolvedLink(steps.slice(0, i));
					if (curr) break;
				}
				if (!curr) {
					curr = this.root;
					i = 0;
				}
				curr = this.getResolvedLinkOrThrow(fs_node_utils_2.pathSep + steps.slice(0, i).join(fs_node_utils_2.pathSep), "mkdir");
				for (; i < steps.length; i++) {
					const node = curr.getNode();
					if (node.isDirectory()) {
						if (!node.canExecute() || !node.canWrite()) throw (0, errors_1.createError)("EACCES", "mkdir", filename);
					} else throw (0, errors_1.createError)("ENOTDIR", "mkdir", filename);
					created = true;
					curr = curr.createChild(steps[i], this.createNode(fs_node_utils_1.constants.S_IFDIR | modeNum));
					this.emit(new FsEvent_1.FsEvent(0, curr.steps, curr.getNode(), curr));
				}
				return created ? filename : void 0;
			};
			this.rmdir = (filename, recursive = false) => {
				const link = this.getLinkAsDirOrThrow(filename, "rmdir");
				if (link.length && !recursive) throw (0, errors_1.createError)("ENOTEMPTY", "rmdir", filename);
				this._emitDeleteRecursive(link);
				this.deleteLink(link);
			};
			this.rm = (filename, force = false, recursive = false) => {
				let link;
				try {
					link = this.getResolvedLinkOrThrow(filename, "lstat");
				} catch (err) {
					if (err.code === "ENOENT" && force) return;
					else throw err;
				}
				if (link.getNode().isDirectory() && !recursive) throw (0, errors_1.createEisdirError)("rm", filename);
				if (!link.parent?.getNode().canWrite()) throw (0, errors_1.createError)("EACCES", "rm", filename);
				this._emitDeleteRecursive(link);
				this.deleteLink(link);
			};
			this.close = (fd) => {
				(0, util_1.validateFd)(fd);
				const file = this.getFileByFdOrThrow(fd, "close");
				this.closeFile(file);
			};
			this.ftruncate = (fd, len) => {
				const file = this.getFileByFdOrThrow(fd, "ftruncate");
				file.truncate(len);
				this.emit(new FsEvent_1.FsEvent(2, file.link.steps, file.node, file.link));
			};
			this.fchmod = (fd, modeNum) => {
				const file = this.getFileByFdOrThrow(fd, "fchmod");
				file.chmod(modeNum);
				this.emit(new FsEvent_1.FsEvent(3, file.link.steps, file.node, file.link));
			};
			this.chmod = (filename, modeNum) => {
				const link = this.getResolvedLinkOrThrow(filename, "chmod");
				link.getNode().chmod(modeNum);
				this.emit(new FsEvent_1.FsEvent(3, link.steps, link.getNode(), link));
			};
			this.lchmod = (filename, modeNum) => {
				const link = this.getLinkOrThrow(filename, "lchmod");
				link.getNode().chmod(modeNum);
				this.emit(new FsEvent_1.FsEvent(3, link.steps, link.getNode(), link));
			};
			this.fchown = (fd, uid, gid) => {
				const file = this.getFileByFdOrThrow(fd, "fchown");
				file.chown(uid, gid);
				this.emit(new FsEvent_1.FsEvent(3, file.link.steps, file.node, file.link));
			};
			this.chown = (filename, uid, gid) => {
				const link = this.getResolvedLinkOrThrow(filename, "chown");
				link.getNode().chown(uid, gid);
				this.emit(new FsEvent_1.FsEvent(3, link.steps, link.getNode(), link));
			};
			this.lchown = (filename, uid, gid) => {
				const link = this.getLinkOrThrow(filename, "lchown");
				link.getNode().chown(uid, gid);
				this.emit(new FsEvent_1.FsEvent(3, link.steps, link.getNode(), link));
			};
			this.futimes = (fd, atime, mtime) => {
				const file = this.getFileByFdOrThrow(fd, "futime");
				const node = file.node;
				node.atime = /* @__PURE__ */ new Date(atime * 1e3);
				node.mtime = /* @__PURE__ */ new Date(mtime * 1e3);
				this.emit(new FsEvent_1.FsEvent(3, file.link.steps, file.node, file.link));
			};
			this.utimes = (filename, atime, mtime, followSymlinks = true) => {
				const link = followSymlinks ? this.getResolvedLinkOrThrow(filename, "utime") : this.getLinkOrThrow(filename, "lutime");
				const node = link.getNode();
				node.atime = /* @__PURE__ */ new Date(atime * 1e3);
				node.mtime = /* @__PURE__ */ new Date(mtime * 1e3);
				this.emit(new FsEvent_1.FsEvent(3, link.steps, node, link));
			};
			this.process = opts.process ?? process_1.default;
			const root = this.createLink();
			root.setNode(this.createNode(fs_node_utils_1.constants.S_IFDIR | 511));
			root.setChild(".", root);
			root.getNode().nlink++;
			root.setChild("..", root);
			root.getNode().nlink++;
			this.root = root;
		}
		filenameToSteps(filename) {
			return (0, util_1.filenameToSteps)(filename, this.process.cwd());
		}
		emit(change) {
			this.changes.emit(change);
		}
		createLink(parent, name, isDirectory = false, mode) {
			if (!parent) return new Link_1.Link(this, void 0, "");
			if (!name) throw new Error("createLink: name cannot be empty");
			const finalPerm = mode ?? (isDirectory ? 511 : 438);
			const modeType = mode && mode & fs_node_utils_1.constants.S_IFMT ? mode & fs_node_utils_1.constants.S_IFMT : isDirectory ? fs_node_utils_1.constants.S_IFDIR : fs_node_utils_1.constants.S_IFREG;
			const finalMode = finalPerm & ~fs_node_utils_1.constants.S_IFMT | modeType;
			return parent.createChild(name, this.createNode(finalMode));
		}
		deleteLink(link) {
			const parent = link.parent;
			if (parent) {
				parent.deleteChild(link);
				return true;
			}
			return false;
		}
		_emitDeleteRecursive(link) {
			if (link.getNode().isDirectory()) {
				for (const [name, child] of link.children.entries()) if (child && name !== "." && name !== "..") this._emitDeleteRecursive(child);
			}
			this.emit(new FsEvent_1.FsEvent(1, link.steps, link.getNode(), link));
		}
		newInoNumber() {
			const releasedFd = this.releasedInos.pop();
			if (releasedFd) return releasedFd;
			else {
				this.ino = (this.ino + 1) % 4294967295;
				return this.ino;
			}
		}
		newFdNumber() {
			const releasedFd = this.releasedFds.pop();
			return typeof releasedFd === "number" ? releasedFd : Superblock.fd--;
		}
		createNode(mode) {
			const uid = this.process.getuid?.() ?? 0;
			const gid = this.process.getgid?.() ?? 0;
			const node = new Node_1.Node(this.newInoNumber(), mode, uid, gid);
			this.inodes[node.ino] = node;
			return node;
		}
		deleteNode(node) {
			node.del();
			delete this.inodes[node.ino];
			this.releasedInos.push(node.ino);
		}
		walk(stepsOrFilenameOrLink, resolveSymlinks = false, checkExistence = false, checkAccess = false, funcName, budget) {
			let steps;
			let filename;
			if (stepsOrFilenameOrLink instanceof Link_1.Link) {
				steps = stepsOrFilenameOrLink.steps;
				filename = fs_node_utils_2.pathSep + steps.join(fs_node_utils_2.pathSep);
			} else if (typeof stepsOrFilenameOrLink === "string") {
				steps = this.filenameToSteps(stepsOrFilenameOrLink);
				filename = stepsOrFilenameOrLink;
			} else {
				steps = stepsOrFilenameOrLink;
				filename = fs_node_utils_2.pathSep + steps.join(fs_node_utils_2.pathSep);
			}
			let curr = this.root;
			let i = 0;
			let hops = budget ? budget.hops : 0;
			const uid = this.process.getuid?.() ?? 0;
			const gid = this.process.getgid?.() ?? 0;
			while (i < steps.length) {
				let node = curr.getNode();
				if (node.isDirectory()) {
					if (checkAccess && !node.canExecute(uid, gid)) return (0, result_1.Err)((0, errors_1.createStatError)("EACCES", funcName, filename));
				} else if (i < steps.length - 1) return (0, result_1.Err)((0, errors_1.createStatError)("ENOTDIR", funcName, filename));
				curr = curr.getChild(steps[i]) ?? null;
				if (!curr) if (checkExistence) return (0, result_1.Err)((0, errors_1.createStatError)("ENOENT", funcName, filename));
				else return (0, result_1.Ok)(null);
				node = curr?.getNode();
				if (node.isSymlink() && (resolveSymlinks || i < steps.length - 1)) {
					if (++hops > MAX_SYMLINK_HOPS) return (0, result_1.Err)((0, errors_1.createStatError)("ELOOP", funcName, filename));
					if (budget) budget.hops = hops;
					const resolvedPath = (0, path_1.isAbsolute)(node.symlink) ? node.symlink : (0, fs_node_utils_2.pathJoin)((0, path_1.dirname)(curr.getPath()), node.symlink);
					steps = this.filenameToSteps(resolvedPath).concat(steps.slice(i + 1));
					curr = this.root;
					i = 0;
					continue;
				}
				if (checkExistence && !node.isDirectory() && i < steps.length - 1) {
					const errorCode = this.process.platform === "win32" ? "ENOENT" : "ENOTDIR";
					return (0, result_1.Err)((0, errors_1.createStatError)(errorCode, funcName, filename));
				}
				i++;
			}
			return (0, result_1.Ok)(curr);
		}
		getLink(steps) {
			const result = this.walk(steps, false, false, false);
			if (result.ok) return result.value;
			throw result.err.toError();
		}
		getLinkOrThrow(filename, funcName) {
			const result = this.walk(filename, false, true, true, funcName);
			if (result.ok) return result.value;
			throw result.err.toError();
		}
		getResolvedLink(filenameOrSteps) {
			const result = this.walk(filenameOrSteps, true, false, false);
			if (result.ok) return result.value;
			throw result.err.toError();
		}
		getResolvedLinkOrThrow(filename, funcName) {
			const result = this.walk(filename, true, true, true, funcName);
			if (result.ok) return result.value;
			throw result.err.toError();
		}
		getResolvedLinkResult(filename, funcName) {
			const result = this.walk(filename, true, true, true, funcName);
			if (result.ok) return (0, result_1.Ok)(result.value);
			return result;
		}
		resolveSymlinks(link) {
			return this.getResolvedLink(link.steps.slice(1));
		}
		getLinkAsDirOrThrow(filename, funcName) {
			const link = this.getLinkOrThrow(filename, funcName);
			if (!link.getNode().isDirectory()) throw (0, errors_1.createError)("ENOTDIR", funcName, filename);
			return link;
		}
		getLinkParent(steps) {
			return this.getLink(steps.slice(0, -1));
		}
		getLinkParentAsDirOrThrow(filenameOrSteps, funcName) {
			const steps = (filenameOrSteps instanceof Array ? filenameOrSteps : this.filenameToSteps(filenameOrSteps)).slice(0, -1);
			const filename = fs_node_utils_2.pathSep + steps.join(fs_node_utils_2.pathSep);
			const link = this.getLinkOrThrow(filename, funcName);
			if (!link.getNode().isDirectory()) throw (0, errors_1.createError)("ENOTDIR", funcName, filename);
			return link;
		}
		getFileByFd(fd) {
			return this.fds[String(fd)];
		}
		getFileByFdOrThrow(fd, funcName) {
			(0, util_1.validateFd)(fd);
			const file = this.getFileByFd(fd);
			if (!file) throw (0, errors_1.createError)("EBADF", funcName);
			return file;
		}
		_toJSON(link = this.root, json = {}, path, asBuffer) {
			let isEmpty = true;
			let children = link.children;
			if (link.getNode().isFile()) {
				children = /* @__PURE__ */ new Map([[link.getName(), link.parent.getChild(link.getName())]]);
				link = link.parent;
			}
			for (const name of children.keys()) {
				if (name === "." || name === "..") continue;
				isEmpty = false;
				const child = link.getChild(name);
				if (!child) throw new Error("_toJSON: unexpected undefined");
				const node = child.getNode();
				if (node.isFile()) {
					let filename = child.getPath();
					if (path) filename = (0, fs_node_utils_2.pathRelative)(path, filename);
					json[filename] = asBuffer ? node.getBuffer() : node.getString();
				} else if (node.isDirectory()) this._toJSON(child, json, path, asBuffer);
			}
			let dirPath = link.getPath();
			if (path) dirPath = (0, fs_node_utils_2.pathRelative)(path, dirPath);
			if (dirPath && isEmpty) json[dirPath] = null;
			return json;
		}
		toJSON(paths, json = {}, isRelative = false, asBuffer = false) {
			const links = [];
			if (paths) {
				if (!Array.isArray(paths)) paths = [paths];
				for (const path of paths) {
					const filename = (0, util_1.pathToFilename)(path);
					const link = this.getResolvedLink(filename);
					if (!link) continue;
					links.push(link);
				}
			} else links.push(this.root);
			if (!links.length) return json;
			for (const link of links) this._toJSON(link, json, isRelative ? link.getPath() : "", asBuffer);
			return json;
		}
		fromJSON(json, cwd = this.process.cwd()) {
			for (let filename in json) {
				const data = json[filename];
				filename = (0, util_1.resolve)(filename, cwd);
				if (typeof data === "string" || data instanceof buffer_1.Buffer) {
					const dir = (0, path_1.dirname)(filename);
					this.mkdirp(dir, 511);
					const buffer = (0, util_1.dataToBuffer)(data);
					this.writeFile(filename, buffer, fs_node_utils_2.FLAGS.w, 438);
				} else this.mkdirp(filename, 511);
			}
		}
		fromNestedJSON(json, cwd) {
			this.fromJSON((0, json_1.flattenJSON)(json), cwd);
		}
		reset() {
			this.ino = 0;
			this.inodes = {};
			this.releasedInos = [];
			this.fds = {};
			this.releasedFds = [];
			this.openFiles = 0;
			this.root = this.createLink();
			this.root.setNode(this.createNode(fs_node_utils_1.constants.S_IFDIR | 511));
		}
		mountSync(mountpoint, json) {
			this.fromJSON(json, mountpoint);
		}
		openLink(link, flagsNum, resolveSymlinks = true, filename = link.getPath()) {
			if (this.openFiles >= this.maxFiles) throw (0, errors_1.createError)("EMFILE", "open", filename);
			let realLink = link;
			if (resolveSymlinks) realLink = this.getResolvedLinkOrThrow(link.getPath(), "open");
			const node = realLink.getNode();
			if (node.isDirectory()) {
				if ((flagsNum & (O_RDONLY | O_RDWR | O_WRONLY)) !== O_RDONLY) throw (0, errors_1.createError)("EISDIR", "open", filename);
			} else if (flagsNum & O_DIRECTORY) throw (0, errors_1.createError)("ENOTDIR", "open", filename);
			if (node.isSymlink() && flagsNum & O_NOFOLLOW) throw (0, errors_1.createError)("ELOOP", "open", filename);
			if ((flagsNum & (O_RDONLY | O_RDWR | O_WRONLY)) !== O_WRONLY) {
				if (!node.canRead()) throw (0, errors_1.createError)("EACCES", "open", filename);
			}
			if (flagsNum & (O_WRONLY | O_RDWR)) {
				if (!node.canWrite()) throw (0, errors_1.createError)("EACCES", "open", filename);
			}
			const file = new File_1.File(link, node, flagsNum, this.newFdNumber());
			this.fds[file.fd] = file;
			this.openFiles++;
			if (flagsNum & O_TRUNC) {
				const hadContent = file.node.getSize() > 0;
				file.truncate();
				if (hadContent) this.emit(new FsEvent_1.FsEvent(2, file.link.steps, file.node, file.link));
			}
			return file;
		}
		throwCreatDir(path, filename, budget) {
			const dir = this.walk((0, path_1.dirname)(path), true, true, true, "open", budget);
			if (!dir.ok) throw (0, errors_1.createError)(dir.err.code, "open", filename);
			const node = dir.value.getNode();
			if (!node.isDirectory()) throw (0, errors_1.createError)("ENOTDIR", "open", filename);
			if (!node.canExecute()) throw (0, errors_1.createError)("EACCES", "open", filename);
			throw (0, errors_1.createError)("EISDIR", "open", filename);
		}
		openFile(filename, flagsNum, modeNum, resolveSymlinks = true) {
			if (this.openFiles >= this.maxFiles) throw (0, errors_1.createError)("EMFILE", "open", filename);
			if ((flagsNum & (O_CREAT | O_DIRECTORY)) === (O_CREAT | O_DIRECTORY)) throw (0, errors_1.createError)("EINVAL", "open", filename);
			const win32 = this.process.platform === "win32";
			const budget = { hops: 0 };
			let trailingSlash = endsWithSep(filename, win32);
			if (trailingSlash && flagsNum & O_CREAT) this.throwCreatDir(filename, filename, budget);
			const excl = (flagsNum & (O_CREAT | O_EXCL)) === (O_CREAT | O_EXCL);
			const follow = trailingSlash || resolveSymlinks && !(flagsNum & O_NOFOLLOW) && !excl;
			let path = filename;
			let link = null;
			for (;;) {
				const hops = budget.hops;
				const result = this.walk(path, false, true, true, "open", budget);
				if (!result.ok) {
					const code = result.err.code;
					if (code !== "ENOENT" || !(flagsNum & O_CREAT)) throw (0, errors_1.createError)(code, "open", filename);
					budget.hops = hops;
					link = null;
					break;
				}
				link = result.value;
				const node = link.getNode();
				if (!follow || !node.isSymlink()) break;
				if (++budget.hops > MAX_SYMLINK_HOPS) throw (0, errors_1.createError)("ELOOP", "open", filename);
				path = (0, path_1.isAbsolute)(node.symlink) ? node.symlink : (0, fs_node_utils_2.pathJoin)((0, path_1.dirname)(link.getPath()), node.symlink);
				if (endsWithSep(path, win32)) {
					if (flagsNum & O_CREAT) this.throwCreatDir(path, filename, budget);
					trailingSlash = true;
				}
			}
			if (link) {
				const node = link.getNode();
				if (excl) throw (0, errors_1.createError)("EEXIST", "open", filename);
				if (trailingSlash && !node.isDirectory()) throw (0, errors_1.createError)("ENOTDIR", "open", filename);
				if (flagsNum & O_CREAT && node.isDirectory()) throw (0, errors_1.createError)("EISDIR", "open", filename);
				return this.openLink(link, flagsNum, false, filename);
			}
			const dir = this.walk((0, path_1.dirname)(path), true, true, true, "open", budget);
			if (!dir.ok) throw (0, errors_1.createError)(dir.err.code, "open", filename);
			const dirLink = dir.value;
			const dirNode = dirLink.getNode();
			if (!dirNode.isDirectory()) throw (0, errors_1.createError)("ENOTDIR", "open", filename);
			if (!dirNode.canExecute() || !dirNode.canWrite()) throw (0, errors_1.createError)("EACCES", "open", filename);
			modeNum ?? (modeNum = 438);
			const steps = (0, util_1.filenameToSteps)(path);
			link = this.createLink(dirLink, steps[steps.length - 1], false, modeNum);
			this.emit(new FsEvent_1.FsEvent(0, link.steps, link.getNode(), link));
			return this.openLink(link, flagsNum, false, filename);
		}
		closeFile(file) {
			if (!this.fds[file.fd]) return;
			this.openFiles--;
			delete this.fds[file.fd];
			this.releasedFds.push(file.fd);
		}
		write(fd, buf, offset, length, position) {
			const file = this.getFileByFdOrThrow(fd, "write");
			if (file.node.isSymlink()) throw (0, errors_1.createError)("EBADF", "write", file.link.getPath());
			const bytes = file.write(buf, offset, length, position === -1 || typeof position !== "number" ? void 0 : position);
			if (bytes > 0) this.emit(new FsEvent_1.FsEvent(2, file.link.steps, file.node, file.link));
			return bytes;
		}
	};
	exports.Superblock = Superblock;
	Superblock.fd = 2147483647;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-core@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-core/lib/watch/CoreWatcher.js
var require_CoreWatcher = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.CoreWatcher = exports.CoreWatchEvent = void 0;
	const fanout_1 = require_fanout();
	var CoreWatchEvent = class {
		constructor(type, steps, node, link, oldSteps = void 0) {
			this.type = type;
			this.steps = steps;
			this.node = node;
			this.link = link;
			this.oldSteps = oldSteps;
		}
	};
	exports.CoreWatchEvent = CoreWatchEvent;
	var CoreWatcher = class {
		constructor(core, path, opts = {}) {
			this.changes = new fanout_1.FanOut();
			this.link = opts.follow ?? true ? core.getResolvedLinkOrThrow(path, "watch") : core.getLinkOrThrow(path, "watch");
			this.node = this.link.getNode();
			this.recursive = !!opts.recursive;
			this.unsub = core.changes.listen((event) => this.onEvent(event));
		}
		get closed() {
			return !this.unsub;
		}
		onEvent(event) {
			const rootLength = this.link.steps.length;
			if (event.link === this.link || event.node === this.node && (event.type === 2 || event.type === 3)) {
				this.changes.emit(new CoreWatchEvent(event.type, [], event.node, this.link));
				if (event.type === 1) this.close();
				return;
			}
			if (event.type === 4) {
				const from = event.oldSteps && this.inScope(event.oldSteps) ? event.oldSteps.slice(rootLength) : void 0;
				const to = this.inScope(event.steps) ? event.steps.slice(rootLength) : void 0;
				if (from && to) this.changes.emit(new CoreWatchEvent(4, to, event.node, event.link, from));
				else if (from) this.changes.emit(new CoreWatchEvent(1, from, event.node, event.link));
				else if (to) this.changes.emit(new CoreWatchEvent(0, to, event.node, event.link));
				return;
			}
			if (this.inScope(event.steps)) this.changes.emit(new CoreWatchEvent(event.type, event.steps.slice(rootLength), event.node, event.link));
		}
		inScope(steps) {
			const root = this.link.steps;
			if (steps.length <= root.length) return false;
			if (!this.recursive && steps.length !== root.length + 1) return false;
			for (let i = 0; i < root.length; i++) if (steps[i] !== root[i]) return false;
			return true;
		}
		close() {
			this.unsub?.();
			this.unsub = void 0;
		}
	};
	exports.CoreWatcher = CoreWatcher;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-core@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-core/lib/index.js
var require_lib$5 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.SystemError = exports.createWatchError = exports.createEisdirError = exports.createStatError = exports.createError = exports.resolve = exports.pathToFilename = exports.nullCheck = exports.validateFd = exports.isWin = exports.isFd = exports.filenameToSteps = exports.dataToBuffer = exports.Superblock = exports.File = exports.Link = exports.Node = void 0;
	const tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
	tslib_1.__exportStar(require_types$1(), exports);
	tslib_1.__exportStar(require_json$1(), exports);
	tslib_1.__exportStar(require_constants$2(), exports);
	tslib_1.__exportStar(require_result(), exports);
	var Node_1 = require_Node();
	Object.defineProperty(exports, "Node", {
		enumerable: true,
		get: function() {
			return Node_1.Node;
		}
	});
	var Link_1 = require_Link();
	Object.defineProperty(exports, "Link", {
		enumerable: true,
		get: function() {
			return Link_1.Link;
		}
	});
	var File_1 = require_File();
	Object.defineProperty(exports, "File", {
		enumerable: true,
		get: function() {
			return File_1.File;
		}
	});
	var Superblock_1 = require_Superblock();
	Object.defineProperty(exports, "Superblock", {
		enumerable: true,
		get: function() {
			return Superblock_1.Superblock;
		}
	});
	tslib_1.__exportStar(require_FsEvent(), exports);
	tslib_1.__exportStar(require_CoreWatcher(), exports);
	var util_1 = require_util$3();
	Object.defineProperty(exports, "dataToBuffer", {
		enumerable: true,
		get: function() {
			return util_1.dataToBuffer;
		}
	});
	Object.defineProperty(exports, "filenameToSteps", {
		enumerable: true,
		get: function() {
			return util_1.filenameToSteps;
		}
	});
	Object.defineProperty(exports, "isFd", {
		enumerable: true,
		get: function() {
			return util_1.isFd;
		}
	});
	Object.defineProperty(exports, "isWin", {
		enumerable: true,
		get: function() {
			return util_1.isWin;
		}
	});
	Object.defineProperty(exports, "validateFd", {
		enumerable: true,
		get: function() {
			return util_1.validateFd;
		}
	});
	Object.defineProperty(exports, "nullCheck", {
		enumerable: true,
		get: function() {
			return util_1.nullCheck;
		}
	});
	Object.defineProperty(exports, "pathToFilename", {
		enumerable: true,
		get: function() {
			return util_1.pathToFilename;
		}
	});
	Object.defineProperty(exports, "resolve", {
		enumerable: true,
		get: function() {
			return util_1.resolve;
		}
	});
	var errors_1 = require_errors();
	Object.defineProperty(exports, "createError", {
		enumerable: true,
		get: function() {
			return errors_1.createError;
		}
	});
	Object.defineProperty(exports, "createStatError", {
		enumerable: true,
		get: function() {
			return errors_1.createStatError;
		}
	});
	Object.defineProperty(exports, "createEisdirError", {
		enumerable: true,
		get: function() {
			return errors_1.createEisdirError;
		}
	});
	Object.defineProperty(exports, "createWatchError", {
		enumerable: true,
		get: function() {
			return errors_1.createWatchError;
		}
	});
	var SystemError_1 = require_SystemError();
	Object.defineProperty(exports, "SystemError", {
		enumerable: true,
		get: function() {
			return SystemError_1.SystemError;
		}
	});
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node/lib/Stats.js
var require_Stats = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Stats = void 0;
	const { S_IFMT, S_IFDIR, S_IFREG, S_IFBLK, S_IFCHR, S_IFLNK, S_IFIFO, S_IFSOCK } = require_lib$6().constants;
	var Stats = class Stats {
		static build(node, bigint = false) {
			const stats = new Stats();
			const { uid, gid, atime, mtime, ctime, btime } = node;
			const getStatNumber = !bigint ? (number) => number : (number) => BigInt(number);
			stats.uid = getStatNumber(uid);
			stats.gid = getStatNumber(gid);
			stats.rdev = getStatNumber(node.rdev);
			stats.blksize = getStatNumber(4096);
			stats.ino = getStatNumber(node.ino);
			stats.size = getStatNumber(node.getSize());
			stats.blocks = getStatNumber(1);
			stats.atime = new Date(atime.getTime());
			stats.mtime = new Date(mtime.getTime());
			stats.ctime = new Date(ctime.getTime());
			stats.birthtime = new Date(btime.getTime());
			stats.atimeMs = getStatNumber(atime.getTime());
			stats.mtimeMs = getStatNumber(mtime.getTime());
			stats.ctimeMs = getStatNumber(ctime.getTime());
			stats.birthtimeMs = getStatNumber(btime.getTime());
			if (bigint) {
				stats.atimeNs = BigInt(atime.getTime()) * BigInt(1e6);
				stats.mtimeNs = BigInt(mtime.getTime()) * BigInt(1e6);
				stats.ctimeNs = BigInt(ctime.getTime()) * BigInt(1e6);
				stats.birthtimeNs = BigInt(btime.getTime()) * BigInt(1e6);
			}
			stats.dev = getStatNumber(0);
			stats.mode = getStatNumber(node.mode);
			stats.nlink = getStatNumber(node.nlink);
			return stats;
		}
		_checkModeProperty(property) {
			return (Number(this.mode) & S_IFMT) === property;
		}
		isDirectory() {
			return this._checkModeProperty(S_IFDIR);
		}
		isFile() {
			return this._checkModeProperty(S_IFREG);
		}
		isBlockDevice() {
			return this._checkModeProperty(S_IFBLK);
		}
		isCharacterDevice() {
			return this._checkModeProperty(S_IFCHR);
		}
		isSymbolicLink() {
			return this._checkModeProperty(S_IFLNK);
		}
		isFIFO() {
			return this._checkModeProperty(S_IFIFO);
		}
		isSocket() {
			return this._checkModeProperty(S_IFSOCK);
		}
	};
	exports.Stats = Stats;
	exports.default = Stats;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node/lib/Dirent.js
var require_Dirent = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Dirent = void 0;
	const fs_node_utils_1 = require_lib$6();
	const { S_IFMT, S_IFDIR, S_IFREG, S_IFBLK, S_IFCHR, S_IFLNK, S_IFIFO, S_IFSOCK } = fs_node_utils_1.constants;
	var Dirent = class Dirent {
		constructor() {
			this.name = "";
			this.parentPath = "";
			this.mode = 0;
			this.path = "";
		}
		static build(link, encoding, parentPath = link.getParentPath()) {
			const dirent = new Dirent();
			const { mode } = link.getNode();
			dirent.name = (0, fs_node_utils_1.strToEncoding)(link.getName(), encoding);
			dirent.mode = mode;
			dirent.parentPath = parentPath;
			dirent.path = parentPath;
			return dirent;
		}
		_checkModeProperty(property) {
			return (this.mode & S_IFMT) === property;
		}
		isDirectory() {
			return this._checkModeProperty(S_IFDIR);
		}
		isFile() {
			return this._checkModeProperty(S_IFREG);
		}
		isBlockDevice() {
			return this._checkModeProperty(S_IFBLK);
		}
		isCharacterDevice() {
			return this._checkModeProperty(S_IFCHR);
		}
		isSymbolicLink() {
			return this._checkModeProperty(S_IFLNK);
		}
		isFIFO() {
			return this._checkModeProperty(S_IFIFO);
		}
		isSocket() {
			return this._checkModeProperty(S_IFSOCK);
		}
	};
	exports.Dirent = Dirent;
	exports.default = Dirent;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node/lib/StatFs.js
var require_StatFs = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.StatFs = void 0;
	var StatFs = class StatFs {
		static build(superblock, bigint = false) {
			const statfs = new StatFs();
			const getStatNumber = !bigint ? (number) => number : (number) => BigInt(number);
			statfs.type = getStatNumber(2240043254);
			statfs.bsize = getStatNumber(4096);
			const totalInodes = Object.keys(superblock.inodes).length;
			const totalBlocks = 1e6;
			const freeBlocks = totalBlocks - Math.min(totalInodes * 2, totalBlocks);
			statfs.blocks = getStatNumber(totalBlocks);
			statfs.bfree = getStatNumber(freeBlocks);
			statfs.bavail = getStatNumber(freeBlocks);
			const maxFiles = 1e6;
			statfs.files = getStatNumber(maxFiles);
			statfs.ffree = getStatNumber(maxFiles - totalInodes);
			return statfs;
		}
	};
	exports.StatFs = StatFs;
	exports.default = StatFs;
}));
//#endregion
//#region \0require-as-import:node:url
var require__require_as_import_node_url = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = m$2.default;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node-builtins@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node-builtins/lib/url.js
var require_url = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.URL = void 0;
	var node_url_1 = require__require_as_import_node_url();
	Object.defineProperty(exports, "URL", {
		enumerable: true,
		get: function() {
			return node_url_1.URL;
		}
	});
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node/lib/readWriteArgs.js
var require_readWriteArgs = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.getWriteSyncArgs = exports.getWriteArgs = exports.getVectorCallbackArgs = exports.getVectorArgs = exports.getHandleWriteArgs = exports.getHandleReadArgs = exports.getReadArgs = exports.getReadSyncArgs = void 0;
	const buffer_1 = require_buffer();
	const fs_core_1 = require_lib$5();
	const argErrors_1 = require_argErrors();
	const validators_1 = require_validators();
	const READ_BUFFER_SIZE = 16384;
	const validateOptions = (value, name) => (0, validators_1.validateObject)(value, name, 1);
	const validatePosition = (position, name, length) => {
		if (typeof position === "number") (0, validators_1.validateInteger)(position, name, -1);
		else if (typeof position === "bigint") {
			const max = 2n ** 63n - 1n - BigInt(length);
			if (!(position >= -1n && position <= max)) throw (0, argErrors_1.outOfRange)(name, ">= -1 && <= " + max, position);
		} else throw (0, argErrors_1.invalidArgType)(name, "of type bigint or integer", position);
	};
	const validateBufferArray = (buffers, name = "buffers") => {
		if (!Array.isArray(buffers)) throw (0, argErrors_1.invalidArgType)(name, "an ArrayBufferView[]", buffers);
		const length = buffers.length;
		for (let i = 0; i < length; i++) if (!ArrayBuffer.isView(buffers[i])) throw (0, argErrors_1.invalidArgType)(name, "an ArrayBufferView[]", buffers);
	};
	const validateOffsetLengthRead = (offset, length, bufferLength) => {
		if (offset < 0) throw (0, argErrors_1.outOfRange)("offset", ">= 0", offset);
		if (length < 0) throw (0, argErrors_1.outOfRange)("length", ">= 0", length);
		if (offset + length > bufferLength) throw (0, argErrors_1.outOfRange)("length", "<= " + (bufferLength - offset), length);
	};
	const validateOffsetLengthWrite = (offset, length, byteLength) => {
		if (offset > byteLength) throw (0, argErrors_1.outOfRange)("offset", "<= " + byteLength, offset);
		if (length > byteLength - offset) throw (0, argErrors_1.outOfRange)("length", "<= " + (byteLength - offset), length);
		if (length < 0) throw (0, argErrors_1.outOfRange)("length", ">= 0", length);
		(0, validators_1.validateInt32)(length, "length", 0);
	};
	const validateStringAfterArrayBufferView = (buffer, name) => {
		if (typeof buffer !== "string") throw (0, argErrors_1.invalidArgType)(name, "of type string or an instance of Buffer, TypedArray, or DataView", buffer);
	};
	const toEncoding = (encoding) => typeof encoding === "string" && buffer_1.Buffer.isEncoding(encoding) ? encoding : "utf8";
	const validateEncoding = (data, encoding) => {
		if (toEncoding(encoding) === "hex" && data.length % 2 !== 0) throw (0, argErrors_1.invalidArgValue)("encoding", encoding, "is invalid for data of length " + data.length);
	};
	const viewToBuffer = (view) => buffer_1.Buffer.isBuffer(view) ? view : buffer_1.Buffer.from(view.buffer, view.byteOffset, view.byteLength);
	const seekPosition = (position) => typeof position === "number" && position >= 0 && Number.isSafeInteger(position) ? position : null;
	const readPosition = (position) => {
		if (typeof position === "bigint") return position < 0n ? null : Number(position);
		return position < 0 ? null : position;
	};
	const getReadSyncArgs = (argc, buffer, a, b, c) => {
		(0, validators_1.validateBuffer)(buffer);
		const view = buffer;
		let offset = a;
		let length = b;
		let position = c;
		if (argc <= 3 || typeof a === "object") {
			if (a !== void 0) validateOptions(a, "options");
			const options = a ?? {};
			offset = options.offset !== void 0 ? options.offset : 0;
			length = options.length !== void 0 ? options.length : view.byteLength - offset;
			position = options.position !== void 0 ? options.position : null;
		}
		if (offset === void 0) offset = 0;
		else (0, validators_1.validateInteger)(offset, "offset", 0);
		length = length | 0;
		if (position === void 0 || position === null) position = -1;
		else validatePosition(position, "position", length);
		if (length !== 0) {
			if (view.byteLength === 0) throw (0, argErrors_1.invalidArgValue)("buffer", view, "is empty and cannot be written");
			validateOffsetLengthRead(offset, length, view.byteLength);
		}
		return {
			buffer: view,
			offset,
			length,
			position: readPosition(position)
		};
	};
	exports.getReadSyncArgs = getReadSyncArgs;
	const getReadArgs = (argc, buffer, a, b, c, d) => {
		let buf = buffer;
		let params = null;
		let offset = a;
		let length = b;
		let position = c;
		let callback = d;
		if (argc <= 4) {
			if (argc === 4) {
				validateOptions(a, "options");
				callback = b;
				params = a;
			} else if (argc === 3) {
				if (!ArrayBuffer.isView(buf)) {
					params = buf;
					const source = buf ?? {};
					buf = source.buffer !== void 0 ? source.buffer : buffer_1.Buffer.alloc(READ_BUFFER_SIZE);
				}
				callback = a;
			} else {
				callback = buf;
				buf = buffer_1.Buffer.alloc(READ_BUFFER_SIZE);
			}
			if (params !== void 0) validateOptions(params, "options");
			const source = params ?? {};
			offset = source.offset !== void 0 ? source.offset : 0;
			length = source.length !== void 0 ? source.length : buf?.byteLength - offset;
			position = source.position !== void 0 ? source.position : null;
		}
		(0, validators_1.validateBuffer)(buf);
		(0, validators_1.validateFunction)(callback, "cb");
		if (offset === void 0 || offset === null) offset = 0;
		else (0, validators_1.validateInteger)(offset, "offset", 0);
		length = length | 0;
		if (position === void 0 || position === null) position = -1;
		else validatePosition(position, "position", length);
		if (length !== 0) {
			if (buf.byteLength === 0) throw (0, argErrors_1.invalidArgValue)("buffer", buf, "is empty and cannot be written");
			validateOffsetLengthRead(offset, length, buf.byteLength);
		}
		return {
			buffer: buf,
			offset,
			length,
			position: readPosition(position),
			callback
		};
	};
	exports.getReadArgs = getReadArgs;
	const getHandleReadArgs = (bufferOrParams, a, b, c) => {
		let buf = bufferOrParams;
		let offset = a;
		let length = b;
		let position = c;
		if (!ArrayBuffer.isView(buf)) {
			if (bufferOrParams !== void 0) validateOptions(bufferOrParams, "options");
			const source = bufferOrParams ?? {};
			buf = source.buffer !== void 0 ? source.buffer : buffer_1.Buffer.alloc(READ_BUFFER_SIZE);
			offset = source.offset !== void 0 ? source.offset : 0;
			length = source.length !== void 0 ? source.length : buf.byteLength - offset;
			position = source.position !== void 0 ? source.position : null;
			(0, validators_1.validateBuffer)(buf);
		}
		if (offset !== null && typeof offset === "object") {
			const options = offset;
			offset = options.offset !== void 0 ? options.offset : 0;
			length = options.length !== void 0 ? options.length : buf.byteLength - offset;
			position = options.position !== void 0 ? options.position : null;
		}
		if (offset === void 0 || offset === null) offset = 0;
		else (0, validators_1.validateInteger)(offset, "offset", 0);
		if (length === void 0 || length === null) length = buf.byteLength - offset;
		if (position === void 0 || position === null) position = -1;
		else validatePosition(position, "position", length);
		if (length !== 0) {
			if (buf.byteLength === 0) throw (0, argErrors_1.invalidArgValue)("buffer", buf, "is empty and cannot be written");
			validateOffsetLengthRead(offset, length, buf.byteLength);
		}
		return {
			buffer: buf,
			offset,
			length,
			position: readPosition(position)
		};
	};
	exports.getHandleReadArgs = getHandleReadArgs;
	const getHandleWriteArgs = (data, a, b, c) => {
		if (data?.byteLength === 0) return null;
		let offset = a;
		let length = b;
		let position = c;
		if (ArrayBuffer.isView(data)) {
			const view = data;
			if (typeof offset === "object") {
				const options = offset ?? {};
				offset = options.offset !== void 0 ? options.offset : 0;
				length = options.length !== void 0 ? options.length : view.byteLength - offset;
				position = options.position !== void 0 ? options.position : null;
			}
			if (offset === void 0 || offset === null) offset = 0;
			else (0, validators_1.validateInteger)(offset, "offset", 0);
			if (typeof length !== "number") length = view.byteLength - offset;
			validateOffsetLengthWrite(offset, length, view.byteLength);
			return {
				buffer: viewToBuffer(view),
				offset,
				length,
				position: seekPosition(position)
			};
		}
		validateStringAfterArrayBufferView(data, "buffer");
		const str = data;
		validateEncoding(str, length);
		const buf = (0, buffer_1.bufferFrom)(str, toEncoding(length));
		return {
			buffer: buf,
			offset: 0,
			length: buf.length,
			position: seekPosition(offset)
		};
	};
	exports.getHandleWriteArgs = getHandleWriteArgs;
	const getVectorArgs = (buffers, position) => {
		validateBufferArray(buffers);
		return seekPosition(position);
	};
	exports.getVectorArgs = getVectorArgs;
	const getVectorCallbackArgs = (buffers, a, b) => {
		validateBufferArray(buffers);
		const callback = b || a;
		(0, validators_1.validateFunction)(callback, "cb");
		return [seekPosition(a), callback];
	};
	exports.getVectorCallbackArgs = getVectorCallbackArgs;
	const getWriteArgs = (fd, a, b, c, d, e) => {
		(0, validators_1.validateInt32)(fd, "fd", 0);
		let offset = b;
		let length = c;
		let position = d;
		let callback = e;
		if (ArrayBuffer.isView(a)) {
			const view = a;
			if (!callback) callback = position || length || offset;
			(0, validators_1.validateFunction)(callback, "cb");
			if (typeof offset === "object") {
				const options = offset ?? {};
				offset = options.offset !== void 0 ? options.offset : 0;
				length = options.length !== void 0 ? options.length : view.byteLength - offset;
				position = options.position !== void 0 ? options.position : null;
			}
			if (offset === void 0 || offset === null || typeof offset === "function") offset = 0;
			else (0, validators_1.validateInteger)(offset, "offset", 0);
			if (typeof length !== "number") length = view.byteLength - offset;
			validateOffsetLengthWrite(offset, length, view.byteLength);
			return [
				fd,
				false,
				viewToBuffer(view),
				offset,
				length,
				seekPosition(position),
				callback
			];
		}
		validateStringAfterArrayBufferView(a, "buffer");
		if (typeof position !== "function") {
			if (typeof offset === "function") {
				position = offset;
				offset = null;
			} else position = length;
			length = "utf8";
		}
		const str = a;
		validateEncoding(str, length);
		callback = position;
		(0, validators_1.validateFunction)(callback, "cb");
		const buf = (0, buffer_1.bufferFrom)(str, toEncoding(length));
		return [
			fd,
			true,
			buf,
			0,
			buf.length,
			seekPosition(offset),
			callback
		];
	};
	exports.getWriteArgs = getWriteArgs;
	const getWriteSyncArgs = (fd, a, b, c, d) => {
		let offset = b;
		let length = c;
		let position = d;
		if (ArrayBuffer.isView(a)) {
			const view = a;
			if (typeof offset === "object") {
				const options = offset ?? {};
				offset = options.offset !== void 0 ? options.offset : 0;
				length = options.length !== void 0 ? options.length : view.byteLength - offset;
				position = options.position !== void 0 ? options.position : null;
			}
			if (offset === void 0 || offset === null) offset = 0;
			else (0, validators_1.validateInteger)(offset, "offset", 0);
			if (typeof length !== "number") length = view.byteLength - offset;
			validateOffsetLengthWrite(offset, length, view.byteLength);
			(0, fs_core_1.validateFd)(fd);
			return [
				fd,
				viewToBuffer(view),
				offset,
				length,
				seekPosition(position)
			];
		}
		validateStringAfterArrayBufferView(a, "buffer");
		const str = a;
		validateEncoding(str, length);
		(0, fs_core_1.validateFd)(fd);
		const buf = (0, buffer_1.bufferFrom)(str, toEncoding(length));
		return [
			fd,
			buf,
			0,
			buf.length,
			seekPosition(offset)
		];
	};
	exports.getWriteSyncArgs = getWriteSyncArgs;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node/lib/util.js
var require_util$2 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.getWriteSyncArgs = exports.getWriteArgs = exports.bufToUint8 = exports.createWatchError = exports.createStatError = exports.createError = exports.pathToFilename = exports.nullCheck = void 0;
	exports.promisify = promisify;
	exports.validateCallback = validateCallback;
	exports.modeToNumber = modeToNumber;
	exports.genRndStr6 = genRndStr6;
	exports.flagsToNumber = flagsToNumber;
	exports.streamToBuffer = streamToBuffer;
	exports.bufferToEncoding = bufferToEncoding;
	exports.isReadableStream = isReadableStream;
	const fs_node_utils_1 = require_lib$6();
	const argErrors_1 = require_argErrors();
	const validators_1 = require_validators();
	const buffer_1 = require_buffer();
	var fs_core_1 = require_lib$5();
	Object.defineProperty(exports, "nullCheck", {
		enumerable: true,
		get: function() {
			return fs_core_1.nullCheck;
		}
	});
	Object.defineProperty(exports, "pathToFilename", {
		enumerable: true,
		get: function() {
			return fs_core_1.pathToFilename;
		}
	});
	Object.defineProperty(exports, "createError", {
		enumerable: true,
		get: function() {
			return fs_core_1.createError;
		}
	});
	Object.defineProperty(exports, "createStatError", {
		enumerable: true,
		get: function() {
			return fs_core_1.createStatError;
		}
	});
	Object.defineProperty(exports, "createWatchError", {
		enumerable: true,
		get: function() {
			return fs_core_1.createWatchError;
		}
	});
	function promisify(fs, fn, getResult = (input) => input) {
		return (...args) => new Promise((resolve, reject) => {
			fs[fn].bind(fs)(...args, (error, result) => {
				if (error) return reject(error);
				return resolve(getResult(result));
			});
		});
	}
	function validateCallback(callback, name = "cb") {
		(0, validators_1.validateFunction)(callback, name);
		return callback;
	}
	const OCTAL_REG = /^[0-7]+$/;
	const MODE_DESC = "must be a 32-bit unsigned integer or an octal string";
	function modeToNumber(mode, def, name = "mode") {
		let value = mode ?? def;
		if (typeof value === "string") {
			if (!OCTAL_REG.test(value)) throw (0, argErrors_1.invalidArgValue)(name, value, MODE_DESC);
			value = parseInt(value, 8);
		}
		(0, validators_1.validateUint32)(value, name);
		return value + 0;
	}
	function genRndStr6() {
		return Math.random().toString(36).slice(2, 8).padEnd(6, "0");
	}
	function flagsToNumber(flags) {
		if (typeof flags === "number") {
			(0, validators_1.validateInt32)(flags, "flags");
			return flags;
		}
		if (typeof flags === "string") {
			const flagsNum = fs_node_utils_1.FLAGS[flags];
			if (typeof flagsNum !== "undefined") return flagsNum;
		}
		throw (0, argErrors_1.invalidArgValue)("flags", flags);
	}
	function streamToBuffer(stream) {
		const chunks = [];
		return new Promise((resolve, reject) => {
			stream.on("data", (chunk) => chunks.push(chunk));
			stream.on("end", () => resolve(buffer_1.Buffer.concat(chunks)));
			stream.on("error", reject);
		});
	}
	const bufToUint8 = (buf) => new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
	exports.bufToUint8 = bufToUint8;
	var readWriteArgs_1 = require_readWriteArgs();
	Object.defineProperty(exports, "getWriteArgs", {
		enumerable: true,
		get: function() {
			return readWriteArgs_1.getWriteArgs;
		}
	});
	Object.defineProperty(exports, "getWriteSyncArgs", {
		enumerable: true,
		get: function() {
			return readWriteArgs_1.getWriteSyncArgs;
		}
	});
	function bufferToEncoding(buffer, encoding) {
		if (!encoding || encoding === "buffer") return buffer;
		else return buffer.toString(encoding);
	}
	function isReadableStream(stream) {
		return stream !== null && typeof stream === "object" && typeof stream.pipe === "function" && typeof stream.on === "function" && stream.readable === true;
	}
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node/lib/glob.js
var require_glob = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.globSync = exports.globWalk = void 0;
	exports.glob = glob;
	const path_1 = require_path$1();
	const url_1 = require_url();
	const argErrors_1 = require_argErrors();
	const validators_1 = require_validators();
	const glob_to_regex_js_1 = require_lib$7();
	const util_1 = require_util$2();
	const Dirent_1 = require_Dirent();
	const { basename, dirname, isAbsolute, join, relative, resolve } = path_1.posix;
	const internalAssertionError = () => (0, argErrors_1.withCode)(/* @__PURE__ */ new Error("This is caused by either a bug in Node.js or incorrect usage of Node.js internals.\nPlease open an issue with this stack trace at https://github.com/nodejs/node/issues\n"), "ERR_INTERNAL_ASSERTION");
	const validateStringArrayOrFunction = (value, name) => {
		if (Array.isArray(value)) {
			for (let i = 0; i < value.length; i++) if (typeof value[i] !== "string") throw (0, argErrors_1.invalidArgType)(name + "[" + i + "]", "of type string", value[i]);
			return;
		}
		if (typeof value !== "function") throw (0, argErrors_1.invalidArgType)(name, "of type function or string[]", value);
	};
	const toPathIfFileURL = (value) => {
		if (!(value instanceof url_1.URL)) return value;
		if (value.protocol !== "file:") throw (0, argErrors_1.invalidUrlScheme)("file");
		return (0, util_1.pathToFilename)(value);
	};
	const GLOBSTAR = Symbol("globstar **");
	const MAGIC = /[*?[]|[!+@]\(/;
	const OPTS = {
		extglob: true,
		dot: false
	};
	const parsePart = (part) => {
		if (part === "**") return GLOBSTAR;
		if (!MAGIC.test(part)) return part;
		return (0, glob_to_regex_js_1.toRegex)(part, OPTS);
	};
	const firstPhasePreProcess = (globParts) => {
		let didSomething = false;
		do {
			didSomething = false;
			for (let n = 0; n < globParts.length; n++) {
				const parts = globParts[n];
				let gs = -1;
				while (-1 !== (gs = parts.indexOf("**", gs + 1))) {
					let gss = gs;
					while (parts[gss + 1] === "**") gss++;
					if (gss > gs) parts.splice(gs + 1, gss - gs);
					const next = parts[gs + 1];
					const p = parts[gs + 2];
					const p2 = parts[gs + 3];
					if (next !== "..") continue;
					if (!p || p === "." || p === ".." || !p2 || p2 === "." || p2 === "..") continue;
					didSomething = true;
					parts.splice(gs, 1);
					const other = parts.slice(0);
					other[gs] = "**";
					globParts.push(other);
					gs--;
				}
				for (let i = 1; i < parts.length - 1; i++) {
					const p = parts[i];
					if (i === 1 && p === "" && parts[0] === "") continue;
					if (p === "." || p === "") {
						didSomething = true;
						parts.splice(i, 1);
						i--;
					}
				}
				if (parts[0] === "." && parts.length === 2 && (parts[1] === "." || parts[1] === "")) {
					didSomething = true;
					parts.pop();
				}
				let dd = 0;
				while (-1 !== (dd = parts.indexOf("..", dd + 1))) {
					const p = parts[dd - 1];
					if (p && p !== "." && p !== ".." && p !== "**") {
						didSomething = true;
						const needDot = dd === 1 && parts[dd + 1] === "**";
						parts.splice(dd - 1, 2, ...needDot ? ["."] : []);
						if (!parts.length) parts.push("");
						dd -= 2;
					}
				}
			}
		} while (didSomething);
		return globParts;
	};
	const partsMatch = (a, b) => {
		let ai = 0;
		let bi = 0;
		const result = [];
		let which = "";
		while (ai < a.length && bi < b.length) if (a[ai] === b[bi]) {
			result.push(which === "b" ? b[bi] : a[ai]);
			ai++;
			bi++;
		} else if (a[ai] === "**" && b[bi] === a[ai + 1]) {
			result.push(a[ai]);
			ai++;
		} else if (b[bi] === "**" && a[ai] === b[bi + 1]) {
			result.push(b[bi]);
			bi++;
		} else if (a[ai] === "*" && b[bi] && !b[bi].startsWith(".") && b[bi] !== "**") {
			if (which === "b") return false;
			which = "a";
			result.push(a[ai]);
			ai++;
			bi++;
		} else if (b[bi] === "*" && a[ai] && !a[ai].startsWith(".") && a[ai] !== "**") {
			if (which === "a") return false;
			which = "b";
			result.push(b[bi]);
			ai++;
			bi++;
		} else return false;
		return a.length === b.length && result;
	};
	const secondPhasePreProcess = (globParts) => {
		for (let i = 0; i < globParts.length - 1; i++) for (let j = i + 1; j < globParts.length; j++) {
			const matched = partsMatch(globParts[i], globParts[j]);
			if (matched) {
				globParts[i] = [];
				globParts[j] = matched;
				break;
			}
		}
		return globParts.filter((parts) => parts.length);
	};
	const compile = (pattern) => {
		const source = pattern.replace(/\\/g, "/");
		if (!source) return [[], []];
		const globSet = [...new Set((0, glob_to_regex_js_1.expandBraces)(source))];
		const globParts = secondPhasePreProcess(firstPhasePreProcess(globSet.map((one) => one.split(/\/+/))));
		return [globParts.map((parts) => parts.map(parsePart)), globParts];
	};
	const createExcludeMatcher = (patterns, root) => {
		const regexes = [];
		for (let i = 0; i < patterns.length; i++) regexes.push((0, glob_to_regex_js_1.toRegex)(resolve(root, patterns[i].replace(/\\/g, "/")), OPTS));
		return (value) => {
			for (let i = 0; i < regexes.length; i++) if (regexes[i].test(value)) return true;
			return false;
		};
	};
	var Pattern = class Pattern {
		constructor(parts, globStrings, indexes, symlinks, realpaths = /* @__PURE__ */ new Set()) {
			this.parts = parts;
			this.globStrings = globStrings;
			this.indexes = indexes;
			this.symlinks = symlinks;
			this.realpaths = realpaths;
			this.last = parts.length - 1;
		}
		isLast(isDirectory) {
			return this.indexes.has(this.last) || this.at(-1) === "" && isDirectory && this.indexes.has(this.last - 1) && this.at(-2) === GLOBSTAR;
		}
		isFirst() {
			return this.indexes.has(0);
		}
		get hasSeenSymlinks() {
			for (const index of this.indexes) if (!this.symlinks.has(index)) return true;
			return false;
		}
		at(index) {
			const parts = this.parts;
			return parts[index < 0 ? parts.length + index : index];
		}
		child(indexes, symlinks = /* @__PURE__ */ new Set(), realpaths = this.realpaths) {
			return new Pattern(this.parts, this.globStrings, indexes, symlinks, realpaths);
		}
		test(index, path) {
			const part = this.parts[index];
			if (part === GLOBSTAR) return true;
			if (typeof part === "string") return part === path;
			return part !== void 0 && part.test(path);
		}
		cacheKey(index) {
			const globStrings = this.globStrings;
			const length = globStrings.length;
			let key = "";
			for (let i = index; i < length; i++) {
				key += globStrings[i];
				if (i !== length - 1) key += "/";
			}
			return key;
		}
	};
	const rethrowUnlessFsError = (error) => {
		if (!error?.code) throw error;
	};
	const direntOf = (name, parentPath, mode) => {
		const dirent = new Dirent_1.default();
		dirent.name = name;
		dirent.parentPath = parentPath;
		dirent.path = parentPath;
		dirent.mode = mode;
		return dirent;
	};
	var Cache = class {
		constructor(fs) {
			this.fs = fs;
			this.stats = /* @__PURE__ */ new Map();
			this.followStats = /* @__PURE__ */ new Map();
			this.realpaths = /* @__PURE__ */ new Map();
			this.readdirs = /* @__PURE__ */ new Map();
			this.seenKeys = /* @__PURE__ */ new Map();
		}
		statSync(path) {
			const cached = this.stats.get(path);
			if (cached !== void 0) return cached;
			let value = null;
			try {
				value = direntOf(basename(path), dirname(path), this.fs.lstatSync(path).mode);
			} catch (error) {
				rethrowUnlessFsError(error);
			}
			this.stats.set(path, value);
			return value;
		}
		followStatSync(path) {
			const cached = this.followStats.get(path);
			if (cached !== void 0) return cached;
			let value = null;
			try {
				value = direntOf(basename(path), dirname(path), this.fs.statSync(path).mode);
			} catch (error) {
				rethrowUnlessFsError(error);
			}
			this.followStats.set(path, value);
			return value;
		}
		realpathSync(path) {
			const cached = this.realpaths.get(path);
			if (cached !== void 0) return cached;
			let value = null;
			try {
				value = String(this.fs.realpathSync(path));
			} catch (error) {
				rethrowUnlessFsError(error);
			}
			this.realpaths.set(path, value);
			return value;
		}
		readdirSync(path) {
			const cached = this.readdirs.get(path);
			if (cached !== void 0) return cached;
			let value = [];
			try {
				value = this.fs.readdirSync(path, { withFileTypes: true });
			} catch (error) {
				rethrowUnlessFsError(error);
			}
			this.readdirs.set(path, value);
			return value;
		}
		addToStatCache(path, value) {
			this.stats.set(path, value);
		}
		add(path, pattern) {
			let keys = this.seenKeys.get(path);
			if (!keys) {
				keys = /* @__PURE__ */ new Set();
				this.seenKeys.set(path, keys);
			}
			const originalSize = keys.size;
			for (const index of pattern.indexes) keys.add(pattern.cacheKey(index));
			return keys.size !== originalSize + pattern.indexes.size;
		}
		seen(path, pattern, index) {
			return !!this.seenKeys.get(path)?.has(pattern.cacheKey(index));
		}
	};
	const depthOf = (root, fullpath) => {
		const rel = relative(root, fullpath);
		if (!rel) return 0;
		const parts = rel.split("/");
		let depth = 0;
		for (let i = 0; i < parts.length; i++) depth += parts[i] === ".." ? -1 : 1;
		return depth;
	};
	const EMPTY_OPTIONS = {};
	var Glob = class {
		constructor(fs, pattern, options = EMPTY_OPTIONS) {
			this.fs = fs;
			this.followSymlinks = false;
			this.isExcluded = () => false;
			this.results = /* @__PURE__ */ new Set();
			this.queue = [];
			this.subpatterns = /* @__PURE__ */ new Map();
			(0, validators_1.validateObject)(options, "options");
			const { exclude, cwd, followSymlinks, withFileTypes, maxdepth } = options;
			this.cache = new Cache(fs);
			this.root = toPathIfFileURL(cwd) ?? ".";
			if (followSymlinks != null) {
				(0, validators_1.validateBoolean)(followSymlinks, "options.followSymlinks");
				this.followSymlinks = followSymlinks;
			}
			this.withFileTypes = !!withFileTypes;
			this.maxdepth = maxdepth ?? Infinity;
			if (exclude != null) {
				validateStringArrayOrFunction(exclude, "options.exclude");
				if (Array.isArray(exclude)) {
					if (typeof this.root !== "string") throw internalAssertionError();
					this.isExcluded = createExcludeMatcher(exclude, this.root);
				} else this.exclude = exclude;
			}
			let patterns;
			if (typeof pattern === "object") {
				(0, validators_1.validateStringArray)(pattern, "patterns");
				patterns = pattern;
			} else {
				(0, validators_1.validateString)(pattern, "patterns");
				patterns = [pattern];
			}
			const compiled = [];
			for (let i = 0; i < patterns.length; i++) {
				const [set, globParts] = compile(patterns[i]);
				for (let j = 0; j < set.length; j++) compiled.push(new Pattern(set[j], globParts[j], /* @__PURE__ */ new Set([0]), /* @__PURE__ */ new Set()));
			}
			this.patterns = compiled;
		}
		*walk() {
			const queue = this.queue;
			queue.push({
				path: ".",
				patterns: this.patterns
			});
			while (queue.length > 0) {
				const item = queue.pop();
				for (let i = 0; i < item.patterns.length; i++) yield* this.walkPattern(item.path, item.patterns[i]);
				this.subpatterns.forEach((patterns, path) => queue.push({
					path,
					patterns
				}));
				this.subpatterns.clear();
			}
		}
		result(path) {
			if (!this.withFileTypes) return path;
			const full = isAbsolute(path) ? path : join(this.root, path);
			const stat = this.cache.statSync(full);
			return direntOf(basename(full), dirname(full), stat ? stat.mode : 0);
		}
		isDirectory(path, stat, pattern) {
			if (stat?.isDirectory()) return true;
			if (!stat?.isSymbolicLink()) return false;
			if (this.followSymlinks) return !!this.cache.followStatSync(path)?.isDirectory();
			return pattern.hasSeenSymlinks;
		}
		nextRealpaths(path, isDirectory, pattern) {
			if (!this.followSymlinks || !isDirectory) return pattern.realpaths;
			const real = this.cache.realpathSync(path);
			if (real === null) return pattern.realpaths;
			const realpaths = new Set(pattern.realpaths);
			realpaths.add(real);
			return realpaths;
		}
		isCyclic(path, isDirectory, pattern) {
			if (!this.followSymlinks || !isDirectory) return false;
			const real = this.cache.realpathSync(path);
			return real !== null && pattern.realpaths.has(real);
		}
		addSubpattern(path, pattern) {
			if (this.isExcluded(path)) return;
			const fullpath = resolve(this.root, path);
			if (this.isExcluded(fullpath + "/") && this.cache.statSync(fullpath)?.isDirectory()) return;
			const exclude = this.exclude;
			if (exclude) {
				if (this.withFileTypes) {
					const stat = this.cache.statSync(path);
					if (stat !== null && exclude(stat)) return;
				} else if (exclude(path)) return;
			}
			const existing = this.subpatterns.get(path);
			if (existing) existing.push(pattern);
			else this.subpatterns.set(path, [pattern]);
		}
		accept(path) {
			if (this.results.has(path)) return false;
			if (this.isExcluded(resolve(this.root, path))) return false;
			this.results.add(path);
			return true;
		}
		*walkPattern(path, pattern) {
			if (this.cache.add(path, pattern)) return;
			const cache = this.cache;
			const fullpath = resolve(this.root, path);
			const stat = cache.statSync(fullpath);
			const last = pattern.last;
			const isDirectory = this.isDirectory(fullpath, stat, pattern);
			const isLast = pattern.isLast(isDirectory);
			const isFirst = pattern.isFirst();
			if (this.isExcluded(fullpath)) return;
			if (isFirst && pattern.at(0) === "") {
				this.addSubpattern("/", pattern.child(/* @__PURE__ */ new Set([1])));
				return;
			}
			if (isFirst && pattern.at(0) === "..") {
				this.addSubpattern("../", pattern.child(/* @__PURE__ */ new Set([1])));
				return;
			}
			if (isFirst && pattern.at(0) === ".") {
				this.addSubpattern(".", pattern.child(/* @__PURE__ */ new Set([1])));
				return;
			}
			if (isLast && typeof pattern.at(-1) === "string") {
				const p = pattern.at(-1);
				const leaf = cache.statSync(join(fullpath, p));
				const match = join(path, p);
				if (leaf && (p || isDirectory) && this.accept(match)) yield this.result(match);
				if (pattern.indexes.size === 1 && pattern.indexes.has(last)) return;
			} else if (isLast && pattern.at(-1) === GLOBSTAR && (path !== "." || pattern.at(0) === "." || !last && stat)) {
				if (this.accept(path)) yield this.result(path);
			}
			if (!isDirectory || this.isCyclic(fullpath, isDirectory, pattern)) return;
			if (this.maxdepth !== Infinity && depthOf(this.root, fullpath) > this.maxdepth) return;
			const nextRealpaths = this.nextRealpaths(fullpath, isDirectory, pattern);
			let children;
			const firstPattern = pattern.indexes.size === 1 && pattern.at(pattern.indexes.values().next().value);
			if (typeof firstPattern === "string") {
				const child = cache.statSync(join(fullpath, firstPattern));
				if (!child) return;
				child.name = firstPattern;
				children = [child];
			} else children = cache.readdirSync(fullpath);
			for (let i = 0; i < children.length; i++) {
				const entry = children[i];
				const name = entry.name;
				const entryPath = join(path, name);
				const entryFullpath = join(fullpath, name);
				cache.addToStatCache(entryFullpath, entry);
				const entryIsDirectory = entry.isDirectory() || this.followSymlinks && entry.isSymbolicLink() && !!cache.followStatSync(entryFullpath)?.isDirectory();
				const subPatterns = /* @__PURE__ */ new Set();
				const nSymlinks = /* @__PURE__ */ new Set();
				for (const index of pattern.indexes) {
					if (cache.seen(entryPath, pattern, index) || cache.seen(entryPath, pattern, index + 1)) return;
					const current = pattern.at(index);
					const nextIndex = index + 1;
					const next = pattern.at(nextIndex);
					const fromSymlink = !this.followSymlinks && pattern.symlinks.has(index);
					if (current === GLOBSTAR) {
						const isDot = name.charCodeAt(0) === 46;
						const nextMatches = pattern.test(nextIndex, name);
						let nextNonGlobIndex = nextIndex;
						while (pattern.at(nextNonGlobIndex) === GLOBSTAR) nextNonGlobIndex++;
						const matchesDot = isDot && pattern.test(nextNonGlobIndex, name);
						if (isDot && !matchesDot || this.exclude && this.exclude(this.withFileTypes ? entry : name)) continue;
						if (!fromSymlink && entryIsDirectory) subPatterns.add(index);
						else if (!fromSymlink && index === last && this.accept(entryPath)) yield this.result(entryPath);
						if (nextMatches && nextIndex === last && !isLast) {
							if (this.accept(entryPath)) yield this.result(entryPath);
						} else if (nextMatches && entryIsDirectory) subPatterns.add(index + 2);
						if ((nextMatches || pattern.at(0) === ".") && (entryIsDirectory || entry.isSymbolicLink()) && !fromSymlink) subPatterns.add(nextIndex);
						if (!this.followSymlinks && entry.isSymbolicLink()) nSymlinks.add(index);
						if (next === ".." && entryIsDirectory) {
							const parent = join(path, "..");
							if (nextIndex < last) {
								if (!this.subpatterns.has(path) && !cache.seen(path, pattern, nextIndex + 1)) this.subpatterns.set(path, [pattern.child(/* @__PURE__ */ new Set([nextIndex + 1]))]);
								if (!this.subpatterns.has(parent) && !cache.seen(parent, pattern, nextIndex + 1)) this.subpatterns.set(parent, [pattern.child(/* @__PURE__ */ new Set([nextIndex + 1]))]);
							} else {
								if (!cache.seen(path, pattern, nextIndex)) {
									cache.add(path, pattern.child(/* @__PURE__ */ new Set([nextIndex])));
									if (this.accept(path)) yield this.result(path);
								}
								if (!cache.seen(path, pattern, nextIndex) || !cache.seen(parent, pattern, nextIndex)) {
									cache.add(parent, pattern.child(/* @__PURE__ */ new Set([nextIndex])));
									if (this.accept(parent)) yield this.result(parent);
								}
							}
						}
					}
					if (typeof current === "string") {
						if (pattern.test(index, name) && index !== last) subPatterns.add(nextIndex);
						else if (current === "." && pattern.test(nextIndex, name)) {
							if (nextIndex === last) {
								if (this.accept(entryPath)) yield this.result(entryPath);
							} else subPatterns.add(nextIndex + 1);
						}
					}
					if (typeof current === "object" && pattern.test(index, name)) {
						if (index === last) {
							if (this.accept(entryPath)) yield this.result(entryPath);
						} else if (entryIsDirectory) subPatterns.add(nextIndex);
					}
				}
				if (subPatterns.size > 0) this.addSubpattern(entryPath, pattern.child(subPatterns, nSymlinks, nextRealpaths));
			}
		}
	};
	const globWalk = (fs, pattern, options) => new Glob(fs, pattern, options).walk();
	exports.globWalk = globWalk;
	const globSync = (fs, pattern, options) => {
		const results = [];
		for (const match of (0, exports.globWalk)(fs, pattern, options)) results.push(match);
		return results;
	};
	exports.globSync = globSync;
	async function* glob(fs, pattern, options) {
		yield* (0, exports.globWalk)(fs, pattern, options);
	}
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node-utils@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node-utils/lib/setTimeoutUnref.js
var require_setTimeoutUnref = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	function setTimeoutUnref(callback, time, args) {
		const ref = setTimeout.apply(typeof globalThis !== "undefined" ? globalThis : global, arguments);
		if (ref && typeof ref === "object" && typeof ref.unref === "function") ref.unref();
		return ref;
	}
	exports.default = setTimeoutUnref;
}));
//#endregion
//#region \0require-as-import:node:stream
var require__require_as_import_node_stream = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = m$1.default;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node-builtins@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node-builtins/lib/stream.js
var require_stream = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Writable = exports.Readable = void 0;
	var node_stream_1 = require__require_as_import_node_stream();
	Object.defineProperty(exports, "Readable", {
		enumerable: true,
		get: function() {
			return node_stream_1.Readable;
		}
	});
	Object.defineProperty(exports, "Writable", {
		enumerable: true,
		get: function() {
			return node_stream_1.Writable;
		}
	});
}));
//#endregion
//#region \0require-as-import:node:events
var require__require_as_import_node_events = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = m.default;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node-builtins@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node-builtins/lib/events.js
var require_events = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.EventEmitter = void 0;
	var node_events_1 = require__require_as_import_node_events();
	Object.defineProperty(exports, "EventEmitter", {
		enumerable: true,
		get: function() {
			return node_events_1.EventEmitter;
		}
	});
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node/lib/FileHandle.js
var require_FileHandle = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.FileHandle = void 0;
	const util_1 = require_util$2();
	const readWriteArgs_1 = require_readWriteArgs();
	const events_1 = require_events();
	const assertOpen = (fd, syscall) => {
		if (fd !== -1) return;
		const error = /* @__PURE__ */ new Error("file closed");
		error.code = "EBADF";
		error.syscall = syscall;
		throw error;
	};
	var FileHandle = class extends events_1.EventEmitter {
		constructor(fs, fd) {
			super();
			this.refs = 1;
			this.closePromise = null;
			this.readableWebStreamLocked = false;
			this.fs = fs;
			this.fd = fd;
		}
		getAsyncId() {
			return this.fd;
		}
		appendFile(data, options) {
			return (0, util_1.promisify)(this.fs, "appendFile")(this.fd, data, options);
		}
		chmod(mode) {
			return (0, util_1.promisify)(this.fs, "fchmod")(this.fd, mode);
		}
		chown(uid, gid) {
			return (0, util_1.promisify)(this.fs, "fchown")(this.fd, uid, gid);
		}
		close() {
			if (this.fd === -1) return Promise.resolve();
			if (this.closePromise) return this.closePromise;
			this.refs--;
			if (this.refs === 0) {
				const currentFd = this.fd;
				this.fd = -1;
				this.closePromise = (0, util_1.promisify)(this.fs, "close")(currentFd).finally(() => {
					this.closePromise = null;
				});
			} else this.closePromise = new Promise((resolve, reject) => {
				this.closeResolve = resolve;
				this.closeReject = reject;
			}).finally(() => {
				this.closePromise = null;
				this.closeReject = void 0;
				this.closeResolve = void 0;
			});
			this.emit("close");
			return this.closePromise;
		}
		datasync() {
			return (0, util_1.promisify)(this.fs, "fdatasync")(this.fd);
		}
		createReadStream(options) {
			return this.fs.createReadStream("", {
				...options,
				fd: this
			});
		}
		createWriteStream(options) {
			return this.fs.createWriteStream("", {
				...options,
				fd: this
			});
		}
		readableWebStream(options = {}) {
			const { type = "bytes", autoClose = false } = options;
			if (this.fd === -1) throw new Error("The FileHandle is closed");
			if (this.closePromise) throw new Error("The FileHandle is closing");
			if (this.readableWebStreamLocked) throw new Error("An error will be thrown if this method is called more than once or is called after the FileHandle is closed or closing.");
			this.readableWebStreamLocked = true;
			this.ref();
			const unlockAndCleanup = () => {
				this.readableWebStreamLocked = false;
				this.unref();
				if (autoClose) this.close().catch(() => {});
			};
			return new ReadableStream({
				type: type === "bytes" ? "bytes" : void 0,
				autoAllocateChunkSize: 16384,
				pull: async (controller) => {
					try {
						const view = controller.byobRequest?.view;
						if (!view) {
							const buffer = /* @__PURE__ */ new Uint8Array(16384);
							const result = await this.read(buffer, 0, buffer.length, null);
							if (result.bytesRead === 0) {
								controller.close();
								unlockAndCleanup();
								return;
							}
							controller.enqueue(buffer.slice(0, result.bytesRead));
							return;
						}
						const result = await this.read(view, 0, view.byteLength, null);
						if (result.bytesRead === 0) {
							controller.close();
							controller.byobRequest.respond(0);
							unlockAndCleanup();
							return;
						}
						controller.byobRequest.respond(result.bytesRead);
					} catch (error) {
						controller.error(error);
						unlockAndCleanup();
					}
				},
				cancel: async () => {
					unlockAndCleanup();
				}
			});
		}
		async read(bufferOrParams, offsetOrOptions, length, position) {
			assertOpen(this.fd, "read");
			const args = (0, readWriteArgs_1.getHandleReadArgs)(bufferOrParams, offsetOrOptions, length, position);
			const buffer = args.buffer;
			if (args.length === 0) return {
				__proto__: null,
				bytesRead: args.length,
				buffer
			};
			return {
				__proto__: null,
				bytesRead: await (0, util_1.promisify)(this.fs, "read")(this.fd, buffer, args.offset, args.length, args.position),
				buffer
			};
		}
		async readv(buffers, position) {
			assertOpen(this.fd, "readv");
			return {
				__proto__: null,
				bytesRead: await (0, util_1.promisify)(this.fs, "readv")(this.fd, buffers, position ?? null),
				buffers
			};
		}
		readFile(options) {
			return (0, util_1.promisify)(this.fs, "readFile")(this.fd, options);
		}
		stat(options) {
			return (0, util_1.promisify)(this.fs, "fstat")(this.fd, options);
		}
		sync() {
			return (0, util_1.promisify)(this.fs, "fsync")(this.fd);
		}
		truncate(len) {
			return (0, util_1.promisify)(this.fs, "ftruncate")(this.fd, len);
		}
		utimes(atime, mtime) {
			return (0, util_1.promisify)(this.fs, "futimes")(this.fd, atime, mtime);
		}
		async write(data, offsetOrOptions, lengthOrEncoding, position) {
			assertOpen(this.fd, "write");
			const args = (0, readWriteArgs_1.getHandleWriteArgs)(data, offsetOrOptions, lengthOrEncoding, position);
			if (!args) return {
				__proto__: null,
				bytesWritten: 0,
				buffer: data
			};
			return {
				__proto__: null,
				bytesWritten: await (0, util_1.promisify)(this.fs, "write")(this.fd, args.buffer, args.offset, args.length, args.position),
				buffer: data
			};
		}
		async writev(buffers, position) {
			assertOpen(this.fd, "writev");
			return {
				__proto__: null,
				bytesWritten: await (0, util_1.promisify)(this.fs, "writev")(this.fd, buffers, position ?? null),
				buffers
			};
		}
		writeFile(data, options) {
			return (0, util_1.promisify)(this.fs, "writeFile")(this.fd, data, options);
		}
		async [Symbol.asyncDispose]() {
			await this.close();
		}
		ref() {
			this.refs++;
		}
		unref() {
			this.refs--;
			if (this.refs === 0) {
				this.fd = -1;
				if (this.closeResolve) (0, util_1.promisify)(this.fs, "close")(this.fd).then(this.closeResolve, this.closeReject);
			}
		}
	};
	exports.FileHandle = FileHandle;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node-builtins@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node-builtins/lib/util.js
var require_util$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.inherits = inherits;
	exports.promisify = promisify;
	exports.inspect = inspect;
	exports.format = format;
	function inherits(ctor, superCtor) {
		if (ctor === void 0 || ctor === null) throw new TypeError("The constructor to inherit from is not defined");
		if (superCtor === void 0 || superCtor === null) throw new TypeError("The super constructor to inherit from is not defined");
		ctor.super_ = superCtor;
		ctor.prototype = Object.create(superCtor.prototype, { constructor: {
			value: ctor,
			enumerable: false,
			writable: true,
			configurable: true
		} });
	}
	function promisify(fn) {
		if (typeof fn !== "function") throw new TypeError("The \"original\" argument must be of type function");
		return function(...args) {
			return new Promise((resolve, reject) => {
				fn.call(this, ...args, (err, result) => {
					if (err) reject(err);
					else resolve(result);
				});
			});
		};
	}
	function inspect(value) {
		if (value === null) return "null";
		if (value === void 0) return "undefined";
		if (typeof value === "string") return `'${value}'`;
		if (typeof value === "number" || typeof value === "boolean") return String(value);
		if (Array.isArray(value)) return `[ ${value.map((item) => inspect(item)).join(", ")} ]`;
		if (typeof value === "object") return `{ ${Object.entries(value).map(([key, val]) => `${key}: ${inspect(val)}`).join(", ")} }`;
		return String(value);
	}
	function format(template, ...args) {
		if (args.length === 0) return template;
		let result = template;
		let argIndex = 0;
		result = result.replace(/%[sdj%]/g, (match) => {
			if (argIndex >= args.length) return match;
			const arg = args[argIndex++];
			switch (match) {
				case "%s": return String(arg);
				case "%d": return Number(arg).toString();
				case "%j": try {
					return JSON.stringify(arg);
				} catch {
					return "[Circular]";
				}
				case "%%": return "%";
				default: return match;
			}
		});
		while (argIndex < args.length) result += " " + String(args[argIndex++]);
		return result;
	}
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node/lib/cp.js
var require_cp = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.cpAsync = exports.cpSync = exports.copyFileCore = exports.getCpOptions = exports.getValidCopyFileMode = void 0;
	const path_1 = require_path$1();
	const fs_node_utils_1 = require_lib$6();
	const fs_core_1 = require_lib$5();
	const argErrors_1 = require_argErrors();
	const validators_1 = require_validators();
	const pathResolve = path_1.posix.resolve;
	const { O_RDONLY, O_WRONLY, O_CREAT, O_EXCL, COPYFILE_EXCL, COPYFILE_FICLONE_FORCE } = fs_node_utils_1.constants;
	const PREFIX = {
		ERR_FS_CP_DIR_TO_NON_DIR: "Cannot overwrite non-directory with directory",
		ERR_FS_CP_EEXIST: "Target already exists",
		ERR_FS_CP_EINVAL: "Invalid src or dest",
		ERR_FS_CP_FIFO_PIPE: "Cannot copy a FIFO pipe",
		ERR_FS_CP_NON_DIR_TO_DIR: "Cannot overwrite directory with non-directory",
		ERR_FS_CP_SOCKET: "Cannot copy a socket file",
		ERR_FS_CP_SYMLINK_TO_SUBDIRECTORY: "Cannot overwrite symlink in subdirectory of self",
		ERR_FS_CP_UNKNOWN: "Cannot copy an unknown file type",
		ERR_FS_EISDIR: "Path is a directory"
	};
	const cpSystemError = (code, message, path, errno, uv) => new fs_core_1.SystemError(code, PREFIX[code], {
		code: uv,
		message,
		path,
		syscall: "cp",
		errno
	});
	const cpCodeError = (code, message) => (0, argErrors_1.withNativeCode)(new Error(message), code);
	const invalidFilterReturn = (value) => (0, argErrors_1.withCode)(/* @__PURE__ */ new TypeError("Expected boolean to be returned from the \"filter\" function but got an instance of Promise."), "ERR_INVALID_RETURN_VALUE");
	const asCopyfileError = (error, src, dest) => error && typeof error.code === "string" && typeof error.syscall === "string" ? (0, fs_core_1.createError)(error.code, "copyfile", src, dest) : error;
	const getValidCpMode = (mode) => {
		if (mode === null || mode === void 0) return 0;
		(0, validators_1.validateInteger)(mode, "mode", 0, 7);
		return mode;
	};
	const getValidCopyFileMode = (mode) => {
		if (mode === null || mode === void 0) return 0;
		if (typeof mode !== "number") throw (0, argErrors_1.withNativeCode)(/* @__PURE__ */ new TypeError("mode must be int32 or null/undefined"), "ERR_INVALID_ARG_TYPE");
		if (!Number.isFinite(mode)) throw (0, argErrors_1.withNativeCode)(/* @__PURE__ */ new RangeError("mode is out of range"), "ERR_OUT_OF_RANGE");
		const truncated = Math.trunc(mode);
		if (truncated < 0 || truncated > 7) throw (0, argErrors_1.withNativeCode)(/* @__PURE__ */ new RangeError("mode is out of range: >= 0 && <= 7"), "ERR_OUT_OF_RANGE");
		return truncated;
	};
	exports.getValidCopyFileMode = getValidCopyFileMode;
	const CP_DEFAULTS = {
		dereference: false,
		errorOnExist: false,
		filter: void 0,
		force: true,
		mode: 0,
		preserveTimestamps: false,
		recursive: false,
		verbatimSymlinks: false
	};
	const getCpOptions = (options) => {
		if (options === void 0) return { ...CP_DEFAULTS };
		(0, validators_1.validateObject)(options, "options");
		const resolved = {
			...CP_DEFAULTS,
			...options
		};
		(0, validators_1.validateBoolean)(resolved.dereference, "options.dereference");
		(0, validators_1.validateBoolean)(resolved.errorOnExist, "options.errorOnExist");
		(0, validators_1.validateBoolean)(resolved.force, "options.force");
		(0, validators_1.validateBoolean)(resolved.preserveTimestamps, "options.preserveTimestamps");
		(0, validators_1.validateBoolean)(resolved.recursive, "options.recursive");
		(0, validators_1.validateBoolean)(resolved.verbatimSymlinks, "options.verbatimSymlinks");
		resolved.mode = getValidCpMode(options.mode);
		if (resolved.dereference === true && resolved.verbatimSymlinks === true) throw (0, argErrors_1.withCode)(/* @__PURE__ */ new TypeError("Option \"dereference\" cannot be used in combination with option \"verbatimSymlinks\""), "ERR_INCOMPATIBLE_OPTION_PAIR");
		if (resolved.filter !== void 0) (0, validators_1.validateFunction)(resolved.filter, "options.filter");
		return resolved;
	};
	exports.getCpOptions = getCpOptions;
	const isPromise = (value) => !!value && (typeof value === "object" || typeof value === "function") && typeof value.then === "function";
	const copyFileCore = (core, src, dest, flags) => {
		let srcFd = -1;
		let destFd = -1;
		let copied = false;
		try {
			srcFd = core.open(src, O_RDONLY, 0);
			const srcNode = core.getFileByFdOrThrow(srcFd, "copyfile").node;
			const srcMode = srcNode.mode;
			const excl = !!(flags & COPYFILE_EXCL);
			destFd = core.open(dest, excl ? O_WRONLY | O_CREAT | O_EXCL : O_WRONLY | O_CREAT, 438);
			const destNode = core.getFileByFdOrThrow(destFd, "copyfile").node;
			if (!excl) {
				if (destNode === srcNode) {
					copied = true;
					return;
				}
				core.ftruncate(destFd, 0);
			}
			core.fchmod(destFd, srcMode);
			if (flags & COPYFILE_FICLONE_FORCE) throw (0, fs_core_1.createError)("ENOSYS", "copyfile", src, dest);
			if (srcNode.isDirectory()) throw (0, fs_core_1.createError)("EISDIR", "copyfile", src, dest);
			const size = srcNode.getSize();
			if (size > 0) core.write(destFd, srcNode.getBuffer(), 0, size, 0);
			copied = true;
		} catch (error) {
			throw asCopyfileError(error, src, dest);
		} finally {
			if (srcFd >= 0) core.close(srcFd);
			if (destFd >= 0) {
				core.close(destFd);
				if (!copied) try {
					core.unlink(dest);
				} catch {}
			}
		}
	};
	exports.copyFileCore = copyFileCore;
	const toParts = (path) => {
		const raw = pathResolve(path).split("/");
		const parts = [];
		for (let i = 0; i < raw.length; i++) if (raw[i]) parts.push(raw[i]);
		return parts;
	};
	const isSrcSubdir = (src, dest) => {
		const srcArr = toParts(src);
		const destArr = toParts(dest);
		const length = srcArr.length;
		if (length > destArr.length) return false;
		for (let i = 0; i < length; i++) if (destArr[i] !== srcArr[i]) return false;
		return true;
	};
	const areIdentical = (srcStat, destStat) => srcStat.ino === destStat.ino && srcStat.dev === destStat.dev;
	const statOf = (vol, path, dereference) => dereference ? vol.statSync(path) : vol.lstatSync(path);
	const statOrNull = (vol, path, dereference) => dereference ? vol.statSync(path, { throwIfNoEntry: false }) : vol.lstatSync(path, { throwIfNoEntry: false });
	const readEntries = (vol, dir) => {
		try {
			return vol.readdirSync(dir);
		} catch (error) {
			const code = error.code;
			throw code ? (0, fs_core_1.createError)(code, "opendir", dir) : error;
		}
	};
	const isDirectory = (vol, path) => {
		const stats = vol.statSync(path, { throwIfNoEntry: false });
		return !!stats && stats.isDirectory();
	};
	const setDestMode = (vol, dest, srcMode) => {
		vol.chmodSync(dest, Number(srcMode));
	};
	const setDestTimestamps = (vol, src, dest) => {
		const updated = vol.statSync(src);
		vol.utimesSync(dest, updated.atime, updated.mtime);
	};
	const resolveLinkTarget = (vol, src, verbatimSymlinks) => {
		const target = String(vol.readlinkSync(src));
		return !verbatimSymlinks && target[0] !== "/" ? pathResolve((0, fs_node_utils_1.pathDirname)(src), target) : target;
	};
	const identicalPaths = (vol, a, b) => {
		try {
			const statA = vol.statSync(a, { throwIfNoEntry: false });
			if (!statA) return false;
			const statB = vol.statSync(b, { throwIfNoEntry: false });
			return !!statB && areIdentical(statA, statB);
		} catch {
			return false;
		}
	};
	const srcAliasesAncestor = (vol, srcStat, srcParent, destParent) => {
		for (let ancestor = destParent; ancestor !== srcParent && ancestor !== "/"; ancestor = (0, fs_node_utils_1.pathDirname)(ancestor)) {
			let stat;
			try {
				stat = vol.statSync(ancestor, { throwIfNoEntry: false });
			} catch {
				return false;
			}
			if (!stat) continue;
			if (!stat.isDirectory()) return false;
			if (areIdentical(srcStat, stat)) return true;
		}
		return false;
	};
	const checkPathsSync = (vol, src, dest, dereference, recursive) => {
		let srcStat;
		try {
			srcStat = statOf(vol, src, !dereference);
		} catch (error) {
			const code = error.code;
			throw code ? (0, fs_core_1.createError)(code, dereference ? "stat" : "lstat", src) : error;
		}
		let destStat;
		try {
			destStat = statOf(vol, dest, dereference);
		} catch {}
		const srcIsDir = srcStat.isDirectory() || dereference && srcStat.isSymbolicLink();
		const srcPath = pathResolve(src);
		const destPath = pathResolve(dest);
		if (destStat) {
			if (identicalPaths(vol, srcPath, destPath)) throw cpCodeError("ERR_FS_CP_EINVAL", "src and dest cannot be the same " + destPath);
			const destIsDir = destStat.isDirectory();
			if (srcIsDir && !destIsDir) throw cpCodeError("ERR_FS_CP_DIR_TO_NON_DIR", "Cannot overwrite non-directory " + destPath + " with directory " + srcPath);
			if (!srcIsDir && destIsDir) throw cpCodeError("ERR_FS_CP_NON_DIR_TO_DIR", "Cannot overwrite directory " + destPath + " with non-directory " + srcPath);
		}
		const srcPrefix = srcPath === "/" ? srcPath : srcPath + "/";
		if (srcIsDir && destPath.startsWith(srcPrefix)) throw cpCodeError("ERR_FS_CP_EINVAL", "Cannot copy " + srcPrefix + " to a subdirectory of self " + destPath);
		const destParent = (0, fs_node_utils_1.pathDirname)(destPath);
		const srcParent = (0, fs_node_utils_1.pathDirname)(srcPath);
		if (srcParent !== destParent && destParent !== "/" && identicalPaths(vol, srcPath, destParent)) throw cpCodeError("ERR_FS_CP_EINVAL", "Cannot copy " + srcPrefix + " to a subdirectory of self " + destPath);
		if (recursive && srcIsDir) {
			const copyStat = statOrNull(vol, src, dereference);
			const followed = dereference ? copyStat : srcStat;
			if (copyStat && followed && copyStat.isDirectory() && srcAliasesAncestor(vol, followed, srcParent, destParent)) throw cpCodeError("ERR_FS_CP_EINVAL", "Cannot copy " + srcPrefix + " to a subdirectory of self " + destPath);
		}
		if (srcIsDir && !recursive) throw cpCodeError("ERR_FS_EISDIR", "Recursive option not enabled, cannot copy a directory: " + srcPrefix);
		if (srcStat.isSocket()) throw cpCodeError("ERR_FS_CP_SOCKET", "Cannot copy a socket file: " + destPath);
		if (srcStat.isFIFO()) throw cpCodeError("ERR_FS_CP_FIFO_PIPE", "Cannot copy a FIFO pipe: " + destPath);
		try {
			if (!destStat || !vol.existsSync(destParent)) vol.mkdirSync(destParent, { recursive: true });
		} catch {}
	};
	const filterSync = (filter, src, dest) => {
		const shouldCopy = filter(src, dest);
		if (isPromise(shouldCopy)) throw invalidFilterReturn(shouldCopy);
		return !!shouldCopy;
	};
	const cpSync = (vol, src, dest, options) => {
		const filter = options.filter;
		if (filter && !filterSync(filter, src, dest)) return;
		checkPathsSync(vol, src, dest, options.dereference, options.recursive);
		getStatsSync(vol, src, dest, options);
	};
	exports.cpSync = cpSync;
	const getStatsSync = (vol, src, dest, options) => {
		const dereference = options.dereference;
		const srcStat = statOf(vol, src, dereference);
		const destStat = statOrNull(vol, dest, dereference);
		if (srcStat.isDirectory() && options.recursive) return onDirSync(srcStat, destStat, vol, src, dest, options);
		if (srcStat.isFile() || srcStat.isCharacterDevice() || srcStat.isBlockDevice()) return onFileSync(srcStat, destStat, vol, src, dest, options);
		if (srcStat.isSymbolicLink()) return onLinkSync(destStat, vol, src, dest, options.verbatimSymlinks);
	};
	const onFileSync = (srcStat, destStat, vol, src, dest, options) => {
		if (destStat) {
			if (options.force) vol.unlinkSync(dest);
			else if (options.errorOnExist) throw cpSystemError("ERR_FS_CP_EEXIST", dest + " already exists", dest, 17, "EEXIST");
			else return;
		}
		(0, exports.copyFileCore)(vol._core, src, dest, options.mode);
		const srcMode = Number(srcStat.mode);
		setDestMode(vol, dest, srcMode);
		if (options.preserveTimestamps) setDestTimestamps(vol, src, dest);
	};
	const onDirSync = (srcStat, destStat, vol, src, dest, options) => {
		if (!destStat) copyDirSync(vol, src, dest, options, true, Number(srcStat.mode));
		else copyDirSync(vol, src, dest, options, false, void 0);
	};
	const copyDirSync = (vol, src, dest, options, mkDir, srcMode) => {
		if (mkDir) vol.mkdirSync(dest);
		try {
			const entries = readEntries(vol, src);
			const filter = options.filter;
			for (let i = 0; i < entries.length; i++) {
				const name = entries[i];
				const srcItem = (0, fs_node_utils_1.pathJoin)(src, name);
				const destItem = (0, fs_node_utils_1.pathJoin)(dest, name);
				if (filter && !filterSync(filter, srcItem, destItem)) continue;
				getStatsSync(vol, srcItem, destItem, options);
			}
		} finally {
			if (srcMode !== void 0) setDestMode(vol, dest, srcMode);
		}
	};
	const onLinkSync = (destStat, vol, src, dest, verbatimSymlinks) => {
		const resolvedSrc = resolveLinkTarget(vol, src, verbatimSymlinks);
		if (!destStat) {
			vol.symlinkSync(resolvedSrc, dest);
			return;
		}
		let resolvedDest;
		try {
			resolvedDest = String(vol.readlinkSync(dest));
		} catch (error) {
			if (error.code === "EINVAL") {
				vol.symlinkSync(resolvedSrc, dest);
				return;
			}
			throw error;
		}
		if (resolvedDest[0] !== "/") resolvedDest = pathResolve((0, fs_node_utils_1.pathDirname)(dest), resolvedDest);
		if (isDirectory(vol, src) && isSrcSubdir(resolvedSrc, resolvedDest)) throw cpCodeError("ERR_FS_CP_EINVAL", "Cannot copy " + resolvedSrc + " to a subdirectory of self " + resolvedDest);
		if (isDirectory(vol, dest) && isSrcSubdir(resolvedDest, resolvedSrc)) throw cpCodeError("ERR_FS_CP_SYMLINK_TO_SUBDIRECTORY", "cannot overwrite " + resolvedDest + " with " + resolvedSrc);
		vol.unlinkSync(dest);
		vol.symlinkSync(resolvedSrc, dest);
	};
	const cpAsync = async (vol, src, dest, options) => {
		const stats = await checkPaths(vol, src, dest, options);
		if (!stats) return;
		checkParentPaths(vol, src, stats.srcStat, dest, options.recursive);
		const destParent = (0, fs_node_utils_1.pathDirname)(dest);
		if (!vol.existsSync(destParent)) vol.mkdirSync(destParent, { recursive: true });
		await getStatsForCopy(vol, stats.destStat, src, dest, options);
	};
	exports.cpAsync = cpAsync;
	const checkPaths = async (vol, src, dest, options) => {
		const filter = options.filter;
		if (filter && !await filter(src, dest)) return void 0;
		const dereference = options.dereference;
		const srcStat = statOf(vol, src, dereference);
		const destStat = statOrNull(vol, dest, dereference);
		if (destStat) {
			if (areIdentical(srcStat, destStat)) throw cpSystemError("ERR_FS_CP_EINVAL", "src and dest cannot be the same", dest, 22, "EINVAL");
			if (srcStat.isDirectory() && !destStat.isDirectory()) throw cpSystemError("ERR_FS_CP_DIR_TO_NON_DIR", "cannot overwrite non-directory " + dest + " with directory " + src, dest, 21, "EISDIR");
			if (!srcStat.isDirectory() && destStat.isDirectory()) throw cpSystemError("ERR_FS_CP_NON_DIR_TO_DIR", "cannot overwrite directory " + dest + " with non-directory " + src, dest, 20, "ENOTDIR");
		}
		if (srcStat.isDirectory() && isSrcSubdir(src, dest)) throw cpSystemError("ERR_FS_CP_EINVAL", "cannot copy " + src + " to a subdirectory of self " + dest, dest, 22, "EINVAL");
		return {
			srcStat,
			destStat
		};
	};
	const checkParentPaths = (vol, src, srcStat, dest, recursive) => {
		const srcParent = pathResolve((0, fs_node_utils_1.pathDirname)(src));
		const skipMissing = recursive && srcStat.isDirectory();
		let at = dest;
		for (let parent = pathResolve((0, fs_node_utils_1.pathDirname)(dest)); parent !== srcParent && parent !== "/"; at = parent, parent = (0, fs_node_utils_1.pathDirname)(parent)) {
			const parentStat = vol.statSync(parent, { throwIfNoEntry: false });
			if (!parentStat) {
				if (skipMissing) continue;
				return;
			}
			if (areIdentical(srcStat, parentStat)) throw cpSystemError("ERR_FS_CP_EINVAL", "cannot copy " + src + " to a subdirectory of self " + at, at, 22, "EINVAL");
		}
	};
	const getStatsForCopy = async (vol, destStat, src, dest, options) => {
		const srcStat = statOf(vol, src, options.dereference);
		if (srcStat.isDirectory() && options.recursive) return onDir(vol, srcStat, destStat, src, dest, options);
		if (srcStat.isDirectory()) throw cpSystemError("ERR_FS_EISDIR", src + " is a directory (not copied)", src, 21, "EISDIR");
		if (srcStat.isFile() || srcStat.isCharacterDevice() || srcStat.isBlockDevice()) return onFile(vol, srcStat, destStat, src, dest, options);
		if (srcStat.isSymbolicLink()) return onLink(vol, destStat, src, dest, options);
		if (srcStat.isSocket()) throw cpSystemError("ERR_FS_CP_SOCKET", "cannot copy a socket file: " + dest, dest, 22, "EINVAL");
		if (srcStat.isFIFO()) throw cpSystemError("ERR_FS_CP_FIFO_PIPE", "cannot copy a FIFO pipe: " + dest, dest, 22, "EINVAL");
		throw cpSystemError("ERR_FS_CP_UNKNOWN", "cannot copy an unknown file type: " + dest, dest, 22, "EINVAL");
	};
	const onFile = async (vol, srcStat, destStat, src, dest, options) => {
		if (destStat) {
			if (options.force) vol.unlinkSync(dest);
			else if (options.errorOnExist) throw cpSystemError("ERR_FS_CP_EEXIST", dest + " already exists", dest, 17, "EEXIST");
			else return;
		}
		(0, exports.copyFileCore)(vol._core, src, dest, options.mode);
		const srcMode = Number(srcStat.mode);
		setDestMode(vol, dest, srcMode);
		if (options.preserveTimestamps) setDestTimestamps(vol, src, dest);
	};
	const onDir = async (vol, srcStat, destStat, src, dest, options) => {
		if (!destStat) {
			vol.mkdirSync(dest);
			await copyDir(vol, src, dest, options);
			setDestMode(vol, dest, Number(srcStat.mode));
			return;
		}
		if (options.errorOnExist && !options.force) throw cpSystemError("ERR_FS_CP_EEXIST", dest + " already exists", dest, 17, "EEXIST");
		await copyDir(vol, src, dest, options);
	};
	const copyDir = async (vol, src, dest, options) => {
		const entries = readEntries(vol, src);
		for (let i = 0; i < entries.length; i++) {
			const name = entries[i];
			const srcItem = (0, fs_node_utils_1.pathJoin)(src, name);
			const destItem = (0, fs_node_utils_1.pathJoin)(dest, name);
			const checked = await checkPaths(vol, srcItem, destItem, options);
			if (checked) await getStatsForCopy(vol, checked.destStat, srcItem, destItem, options);
		}
	};
	const onLink = async (vol, destStat, src, dest, options) => {
		const resolvedSrc = resolveLinkTarget(vol, src, options.verbatimSymlinks);
		if (!destStat) {
			vol.symlinkSync(resolvedSrc, dest);
			return;
		}
		let resolvedDest;
		try {
			resolvedDest = String(vol.readlinkSync(dest));
		} catch (error) {
			if (error.code === "EINVAL") {
				vol.symlinkSync(resolvedSrc, dest);
				return;
			}
			throw error;
		}
		if (resolvedDest[0] !== "/") resolvedDest = pathResolve((0, fs_node_utils_1.pathDirname)(dest), resolvedDest);
		if (isDirectory(vol, src) && isSrcSubdir(resolvedSrc, resolvedDest)) throw cpSystemError("ERR_FS_CP_EINVAL", "cannot copy " + resolvedSrc + " to a subdirectory of self " + resolvedDest, dest, 22, "EINVAL");
		if (statOf(vol, src, true).isDirectory() && isSrcSubdir(resolvedDest, resolvedSrc)) throw cpSystemError("ERR_FS_CP_SYMLINK_TO_SUBDIRECTORY", "cannot overwrite " + resolvedDest + " with " + resolvedSrc, dest, 22, "EINVAL");
		vol.unlinkSync(dest);
		vol.symlinkSync(resolvedSrc, dest);
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node/lib/FsPromises.js
var require_FsPromises = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.FsPromises = void 0;
	const util_1 = require_util$2();
	const cp_1 = require_cp();
	const glob_1 = require_glob();
	const fs_node_utils_1 = require_lib$6();
	const newAbortError = (signal) => {
		const error = /* @__PURE__ */ new Error("The operation was aborted");
		error.name = "AbortError";
		error.code = "ABORT_ERR";
		error.cause = signal.reason;
		return error;
	};
	var FSWatchAsyncIterator = class {
		constructor(fs, path, options = {}) {
			this.fs = fs;
			this.path = path;
			this.options = options;
			this.eventQueue = [];
			this.resolveQueue = [];
			this.finished = false;
			this.maxQueue = options.maxQueue || 2048;
			const overflow = options.overflow || "ignore";
			if (overflow !== "ignore" && overflow !== "error" && overflow !== "throw") throw new TypeError(`The argument 'options.overflow' must be one of: 'ignore', 'error'. Received '${overflow}'`);
			this.overflow = overflow === "throw" ? "error" : overflow;
			const signal = options.signal;
			if (signal) {
				if (signal.aborted) {
					this.finish(newAbortError(signal));
					return;
				}
				this.onAbort = () => this.finish(newAbortError(signal));
				signal.addEventListener("abort", this.onAbort);
			}
			this.startWatching();
		}
		startWatching() {
			const { signal, ...watchOptions } = this.options;
			try {
				this.watcher = this.fs.watch(this.path, watchOptions, (eventType, filename) => {
					this.enqueueEvent({
						eventType,
						filename
					});
				});
			} catch (error) {
				this.finish();
				throw error;
			}
		}
		enqueueEvent(event) {
			if (this.finished) return;
			if (this.eventQueue.length >= this.maxQueue) {
				if (this.overflow === "error") {
					const error = /* @__PURE__ */ new Error(`Watch queue overflow: more than ${this.maxQueue} events queued`);
					error.code = "ERR_FS_WATCH_QUEUE_OVERFLOW";
					this.finish(error);
				} else if (typeof process !== "undefined" && typeof process.emitWarning === "function") process.emitWarning("fs.watch maxQueue exceeded");
				return;
			}
			this.eventQueue.push(event);
			if (this.resolveQueue.length > 0) {
				const { resolve } = this.resolveQueue.shift();
				resolve({
					value: this.eventQueue.shift(),
					done: false
				});
			}
		}
		finish(error) {
			if (this.finished) return;
			this.finished = true;
			this.error = error;
			if (error) this.eventQueue.length = 0;
			if (this.onAbort) {
				this.options.signal.removeEventListener("abort", this.onAbort);
				this.onAbort = void 0;
			}
			if (this.watcher) {
				this.watcher.close();
				this.watcher = null;
			}
			const delivered = error && this.resolveQueue.length > 0;
			while (this.resolveQueue.length > 0) {
				const { resolve, reject } = this.resolveQueue.shift();
				if (error) reject(error);
				else resolve({
					value: void 0,
					done: true
				});
			}
			if (delivered) this.error = void 0;
		}
		async next() {
			if (this.error) {
				const error = this.error;
				this.error = void 0;
				throw error;
			}
			if (this.finished) return {
				value: void 0,
				done: true
			};
			if (this.eventQueue.length > 0) return {
				value: this.eventQueue.shift(),
				done: false
			};
			return new Promise((resolve, reject) => {
				this.resolveQueue.push({
					resolve,
					reject
				});
			});
		}
		async return() {
			this.finish();
			return {
				value: void 0,
				done: true
			};
		}
		async throw(error) {
			this.finish(error);
			throw error;
		}
		[Symbol.asyncIterator]() {
			return this;
		}
	};
	var FsPromises = class {
		constructor(fs, FileHandle) {
			this.fs = fs;
			this.FileHandle = FileHandle;
			this.constants = fs_node_utils_1.constants;
			this.cp = (src, dest, options) => new Promise((resolve, reject) => {
				this.fs.cp(src, dest, (0, cp_1.getCpOptions)(options), (error) => error ? reject(error) : resolve());
			});
			this.copyFile = (src, dest, mode) => new Promise((resolve, reject) => {
				this.fs.copyFile(src, dest, mode, (error) => error ? reject(error) : resolve());
			});
			this.opendir = (0, util_1.promisify)(this.fs, "opendir");
			this.statfs = (0, util_1.promisify)(this.fs, "statfs");
			this.lutimes = (0, util_1.promisify)(this.fs, "lutimes");
			this.glob = (pattern, options) => (0, glob_1.glob)(this.fs, pattern, options);
			this.access = (0, util_1.promisify)(this.fs, "access");
			this.chmod = (0, util_1.promisify)(this.fs, "chmod");
			this.chown = (0, util_1.promisify)(this.fs, "chown");
			this.lchmod = (0, util_1.promisify)(this.fs, "lchmod");
			this.lchown = (0, util_1.promisify)(this.fs, "lchown");
			this.link = (0, util_1.promisify)(this.fs, "link");
			this.lstat = (0, util_1.promisify)(this.fs, "lstat");
			this.mkdir = (0, util_1.promisify)(this.fs, "mkdir");
			this.mkdtemp = (0, util_1.promisify)(this.fs, "mkdtemp");
			this.readdir = (0, util_1.promisify)(this.fs, "readdir");
			this.readlink = (0, util_1.promisify)(this.fs, "readlink");
			this.realpath = (0, util_1.promisify)(this.fs, "realpath");
			this.rename = (0, util_1.promisify)(this.fs, "rename");
			this.rmdir = (0, util_1.promisify)(this.fs, "rmdir");
			this.rm = (0, util_1.promisify)(this.fs, "rm");
			this.stat = (0, util_1.promisify)(this.fs, "stat");
			this.symlink = (0, util_1.promisify)(this.fs, "symlink");
			this.truncate = (0, util_1.promisify)(this.fs, "truncate");
			this.unlink = (0, util_1.promisify)(this.fs, "unlink");
			this.utimes = (0, util_1.promisify)(this.fs, "utimes");
			this.readFile = (id, options) => {
				return (0, util_1.promisify)(this.fs, "readFile")(id instanceof this.FileHandle ? id.fd : id, options);
			};
			this.appendFile = (path, data, options) => {
				return (0, util_1.promisify)(this.fs, "appendFile")(path instanceof this.FileHandle ? path.fd : path, data, options);
			};
			this.open = (path, flags = "r", mode) => {
				return (0, util_1.promisify)(this.fs, "open", (fd) => new this.FileHandle(this.fs, fd))(path, flags, mode);
			};
			this.writeFile = (id, data, options) => {
				return ((0, util_1.isReadableStream)(data) ? (0, util_1.streamToBuffer)(data) : Promise.resolve(data)).then((data) => (0, util_1.promisify)(this.fs, "writeFile")(id instanceof this.FileHandle ? id.fd : id, data, options));
			};
			this.watch = (filename, options) => {
				const watchOptions = typeof options === "string" ? { encoding: options } : options || {};
				return new FSWatchAsyncIterator(this.fs, filename, watchOptions);
			};
		}
	};
	exports.FsPromises = FsPromises;
}));
//#endregion
//#region ../../node_modules/.pnpm/tree-dump@1.1.0_tslib@2.8.1/node_modules/tree-dump/lib/printTree.js
var require_printTree = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.printTree = void 0;
	const printTree = (tab = "", children) => {
		let str = "";
		let last = children.length - 1;
		for (; last >= 0; last--) if (children[last]) break;
		for (let i = 0; i <= last; i++) {
			const fn = children[i];
			if (!fn) continue;
			const isLast = i === last;
			const child = fn(tab + (isLast ? " " : "│") + "  ");
			const branch = child ? isLast ? "└─" : "├─" : "│";
			str += "\n" + tab + branch + (child ? " " + child : "");
		}
		return str;
	};
	exports.printTree = printTree;
}));
//#endregion
//#region ../../node_modules/.pnpm/tree-dump@1.1.0_tslib@2.8.1/node_modules/tree-dump/lib/printBinary.js
var require_printBinary = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.printBinary = void 0;
	const printBinary = (tab = "", children) => {
		const left = children[0], right = children[1];
		let str = "";
		if (left) str += "\n" + tab + "← " + left(tab + "  ");
		if (right) str += "\n" + tab + "→ " + right(tab + "  ");
		return str;
	};
	exports.printBinary = printBinary;
}));
//#endregion
//#region ../../node_modules/.pnpm/tree-dump@1.1.0_tslib@2.8.1/node_modules/tree-dump/lib/printJson.js
var require_printJson = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.printJson = void 0;
	const printJson = (tab = "", json, space = 2) => (JSON.stringify(json, null, space) || "nil").split("\n").join("\n" + tab);
	exports.printJson = printJson;
}));
//#endregion
//#region ../../node_modules/.pnpm/tree-dump@1.1.0_tslib@2.8.1/node_modules/tree-dump/lib/index.js
var require_lib$4 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
	tslib_1.__exportStar(require_printTree(), exports);
	tslib_1.__exportStar(require_printBinary(), exports);
	tslib_1.__exportStar(require_printJson(), exports);
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-print@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-print/lib/index.js
var require_lib$3 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.toTreeSync = void 0;
	const tree_dump_1 = require_lib$4();
	const fs_node_utils_1 = require_lib$6();
	const toTreeSync = (fs, opts = {}) => {
		const separator = opts.separator || "/";
		let dir = opts.dir || separator;
		if (dir[dir.length - 1] !== separator) dir += separator;
		const tab = opts.tab || "";
		const depth = opts.depth ?? 10;
		const sort = opts.sort ?? true;
		let subtree = " (...)";
		if (depth > 0) {
			const list = fs.readdirSync(dir, { withFileTypes: true });
			if (sort) list.sort((a, b) => {
				if (a.isDirectory() && b.isDirectory()) return a.name.toString().localeCompare(b.name.toString());
				else if (a.isDirectory()) return -1;
				else if (b.isDirectory()) return 1;
				else return a.name.toString().localeCompare(b.name.toString());
			});
			subtree = (0, tree_dump_1.printTree)(tab, list.map((entry) => (tab) => {
				if (entry.isDirectory()) return (0, exports.toTreeSync)(fs, {
					dir: dir + entry.name,
					depth: depth - 1,
					tab
				});
				else if (entry.isSymbolicLink()) return "" + entry.name + " → " + fs.readlinkSync(dir + entry.name);
				else return "" + entry.name;
			}));
		}
		return (0, fs_node_utils_1.basename)(dir, separator) + separator + subtree;
	};
	exports.toTreeSync = toTreeSync;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-snapshot@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-snapshot/lib/constants.js
var require_constants$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+buffers@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/buffers/lib/Slice.js
var require_Slice = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Slice = void 0;
	var Slice = class {
		constructor(uint8, view, start, end) {
			this.uint8 = uint8;
			this.view = view;
			this.start = start;
			this.end = end;
		}
		subarray() {
			return this.uint8.subarray(this.start, this.end);
		}
	};
	exports.Slice = Slice;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+buffers@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/buffers/lib/Writer.js
var require_Writer = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Writer = void 0;
	const Slice_1 = require_Slice();
	const EMPTY_UINT8 = new Uint8Array([]);
	const EMPTY_VIEW = new DataView(EMPTY_UINT8.buffer);
	const hasBuffer = typeof Buffer === "function";
	const utf8Write = hasBuffer ? Buffer.prototype.utf8Write : null;
	const from = hasBuffer ? Buffer.from : null;
	const textEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
	var Writer = class {
		constructor(allocSize = 65536) {
			this.allocSize = allocSize;
			this.view = EMPTY_VIEW;
			this.x0 = 0;
			this.x = 0;
			this.uint8 = new Uint8Array(allocSize);
			this.size = allocSize;
			this.view = new DataView(this.uint8.buffer);
		}
		grow(size) {
			const x0 = this.x0;
			const x = this.x;
			const oldUint8 = this.uint8;
			const newUint8 = new Uint8Array(size);
			const view = new DataView(newUint8.buffer);
			const activeSlice = oldUint8.subarray(x0, x);
			newUint8.set(activeSlice, 0);
			this.x = x - x0;
			this.x0 = 0;
			this.uint8 = newUint8;
			this.size = size;
			this.view = view;
		}
		ensureCapacity(capacity) {
			const byteLength = this.size;
			const remaining = byteLength - this.x;
			if (remaining < capacity) {
				const totalRequired = byteLength - this.x0 + (capacity - remaining);
				this.grow(totalRequired <= this.allocSize ? this.allocSize : totalRequired * 2);
			}
		}
		move(capacity) {
			this.ensureCapacity(capacity);
			this.x += capacity;
		}
		reset() {
			this.x0 = this.x;
		}
		newBuffer(size) {
			const uint8 = this.uint8 = new Uint8Array(size);
			this.size = size;
			this.view = new DataView(uint8.buffer);
			this.x = this.x0 = 0;
		}
		flush() {
			const result = this.uint8.subarray(this.x0, this.x);
			this.x0 = this.x;
			return result;
		}
		flushSlice() {
			const slice = new Slice_1.Slice(this.uint8, this.view, this.x0, this.x);
			this.x0 = this.x;
			return slice;
		}
		u8(char) {
			this.ensureCapacity(1);
			this.uint8[this.x++] = char;
		}
		u16(word) {
			this.ensureCapacity(2);
			this.view.setUint16(this.x, word);
			this.x += 2;
		}
		u32(dword) {
			this.ensureCapacity(4);
			this.view.setUint32(this.x, dword);
			this.x += 4;
		}
		i32(dword) {
			this.ensureCapacity(4);
			this.view.setInt32(this.x, dword);
			this.x += 4;
		}
		u64(qword) {
			this.ensureCapacity(8);
			this.view.setBigUint64(this.x, BigInt(qword));
			this.x += 8;
		}
		f64(float) {
			this.ensureCapacity(8);
			this.view.setFloat64(this.x, float);
			this.x += 8;
		}
		u8u16(u8, u16) {
			this.ensureCapacity(3);
			let x = this.x;
			this.uint8[x++] = u8;
			this.uint8[x++] = u16 >>> 8;
			this.uint8[x++] = u16 & 255;
			this.x = x;
		}
		u8u32(u8, u32) {
			this.ensureCapacity(5);
			let x = this.x;
			this.uint8[x++] = u8;
			this.view.setUint32(x, u32);
			this.x = x + 4;
		}
		u8u64(u8, u64) {
			this.ensureCapacity(9);
			let x = this.x;
			this.uint8[x++] = u8;
			this.view.setBigUint64(x, BigInt(u64));
			this.x = x + 8;
		}
		u8f32(u8, f32) {
			this.ensureCapacity(5);
			let x = this.x;
			this.uint8[x++] = u8;
			this.view.setFloat32(x, f32);
			this.x = x + 4;
		}
		u8f64(u8, f64) {
			this.ensureCapacity(9);
			let x = this.x;
			this.uint8[x++] = u8;
			this.view.setFloat64(x, f64);
			this.x = x + 8;
		}
		buf(buf, length) {
			this.ensureCapacity(length);
			const x = this.x;
			this.uint8.set(buf, x);
			this.x = x + length;
		}
		utf8(str) {
			const theoreticalMaxLength = str.length * 4;
			if (theoreticalMaxLength < 168) return this.utf8Native(str);
			this.ensureCapacity(theoreticalMaxLength);
			const maxLength = this.size - this.x;
			if (utf8Write) {
				const writeLength = utf8Write.call(this.uint8, str, this.x, maxLength);
				this.x += writeLength;
				return writeLength;
			} else if (from) {
				const uint8 = this.uint8;
				const offset = uint8.byteOffset + this.x;
				const writeLength = from(uint8.buffer).subarray(offset, offset + maxLength).write(str, 0, maxLength, "utf8");
				this.x += writeLength;
				return writeLength;
			} else if (theoreticalMaxLength > 1024 && textEncoder) {
				const writeLength = textEncoder.encodeInto(str, this.uint8.subarray(this.x, this.x + maxLength)).written;
				this.x += writeLength;
				return writeLength;
			}
			return this.utf8Native(str);
		}
		utf8Native(str) {
			const length = str.length;
			const uint8 = this.uint8;
			let offset = this.x;
			let pos = 0;
			while (pos < length) {
				let value = str.charCodeAt(pos++);
				if ((value & 4294967168) === 0) {
					uint8[offset++] = value;
					continue;
				} else if ((value & 4294965248) === 0) uint8[offset++] = value >> 6 & 31 | 192;
				else {
					if (value >= 55296 && value <= 56319) {
						if (pos < length) {
							const extra = str.charCodeAt(pos);
							if ((extra & 64512) === 56320) {
								pos++;
								value = ((value & 1023) << 10) + (extra & 1023) + 65536;
							}
						}
					}
					if ((value & 4294901760) === 0) {
						uint8[offset++] = value >> 12 & 15 | 224;
						uint8[offset++] = value >> 6 & 63 | 128;
					} else {
						uint8[offset++] = value >> 18 & 7 | 240;
						uint8[offset++] = value >> 12 & 63 | 128;
						uint8[offset++] = value >> 6 & 63 | 128;
					}
				}
				uint8[offset++] = value & 63 | 128;
			}
			const writeLength = offset - this.x;
			this.x = offset;
			return writeLength;
		}
		ascii(str) {
			const length = str.length;
			this.ensureCapacity(length);
			const uint8 = this.uint8;
			let x = this.x;
			let pos = 0;
			while (pos < length) uint8[x++] = str.charCodeAt(pos++);
			this.x = x;
		}
	};
	exports.Writer = Writer;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-snapshot@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-snapshot/lib/shared.js
var require_shared = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.validateEntryName = exports.writer = void 0;
	exports.writer = new (require_Writer()).Writer(32768);
	const validateEntryName = (name) => {
		if (!name || name === "." || name === ".." || name.indexOf("/") !== -1 || name.indexOf("\\") !== -1) throw new Error(`Invalid snapshot entry name: ${JSON.stringify(name)}`);
	};
	exports.validateEntryName = validateEntryName;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-snapshot@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-snapshot/lib/sync.js
var require_sync = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.fromSnapshotSync = exports.toSnapshotSync = void 0;
	const shared_1 = require_shared();
	const toSnapshotSync = ({ fs, path = "/", separator = "/" }) => {
		const stats = fs.lstatSync(path);
		if (stats.isDirectory()) {
			const list = fs.readdirSync(path);
			const entries = {};
			const dir = path.endsWith(separator) ? path : path + separator;
			for (const child of list) {
				const childSnapshot = (0, exports.toSnapshotSync)({
					fs,
					path: `${dir}${child}`,
					separator
				});
				if (childSnapshot) entries["" + child] = childSnapshot;
			}
			return [
				0,
				{},
				entries
			];
		} else if (stats.isFile()) {
			const buf = fs.readFileSync(path);
			return [
				1,
				{},
				new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
			];
		} else if (stats.isSymbolicLink()) return [2, { target: fs.readlinkSync(path).toString() }];
		return null;
	};
	exports.toSnapshotSync = toSnapshotSync;
	const fromSnapshotSync = (snapshot, { fs, path = "/", separator = "/" }) => {
		if (!snapshot) return;
		switch (snapshot[0]) {
			case 0: {
				if (!path.endsWith(separator)) path = path + separator;
				const [, , entries] = snapshot;
				fs.mkdirSync(path, { recursive: true });
				for (const [name, child] of Object.entries(entries)) {
					(0, shared_1.validateEntryName)(name);
					(0, exports.fromSnapshotSync)(child, {
						fs,
						path: `${path}${name}`,
						separator
					});
				}
				break;
			}
			case 1: {
				const [, , data] = snapshot;
				fs.writeFileSync(path, data);
				break;
			}
			case 2: {
				const [, { target }] = snapshot;
				fs.symlinkSync(target, path);
				break;
			}
		}
	};
	exports.fromSnapshotSync = fromSnapshotSync;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+buffers@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/buffers/lib/isFloat32.js
var require_isFloat32 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.isFloat32 = void 0;
	const view = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(4));
	const isFloat32 = (n) => {
		view.setFloat32(0, n);
		return n === view.getFloat32(0);
	};
	exports.isFloat32 = isFloat32;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+json-pack@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/json-pack/lib/JsonPackExtension.js
var require_JsonPackExtension = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.JsonPackExtension = void 0;
	var JsonPackExtension = class {
		constructor(tag, val) {
			this.tag = tag;
			this.val = val;
		}
	};
	exports.JsonPackExtension = JsonPackExtension;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+json-pack@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/json-pack/lib/cbor/CborEncoderFast.js
var require_CborEncoderFast = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.CborEncoderFast = void 0;
	const Writer_1 = require_Writer();
	const isSafeInteger = Number.isSafeInteger;
	var CborEncoderFast = class {
		constructor(writer = new Writer_1.Writer()) {
			this.writer = writer;
		}
		encode(value) {
			this.writeAny(value);
			return this.writer.flush();
		}
		writeAny(value) {
			switch (typeof value) {
				case "number": return this.writeNumber(value);
				case "string": return this.writeStr(value);
				case "boolean": return this.writer.u8(244 + +value);
				case "object":
					if (!value) return this.writer.u8(246);
					switch (value.constructor) {
						case Array: return this.writeArr(value);
						default: return this.writeObj(value);
					}
			}
		}
		writeCbor() {
			this.writer.u8u16(217, 55799);
		}
		writeEnd() {
			this.writer.u8(255);
		}
		writeNull() {
			this.writer.u8(246);
		}
		writeBoolean(bool) {
			if (bool) this.writer.u8(245);
			else this.writer.u8(244);
		}
		writeNumber(num) {
			if (isSafeInteger(num)) this.writeInteger(num);
			else if (typeof num === "bigint") this.writeBigInt(num);
			else this.writeFloat(num);
		}
		writeBigInt(int) {
			if (int >= 0) this.writeBigUint(int);
			else this.writeBigSint(int);
		}
		writeBigUint(uint) {
			if (uint <= Number.MAX_SAFE_INTEGER) return this.writeUInteger(Number(uint));
			this.writer.u8u64(27, uint);
		}
		writeBigSint(int) {
			if (int >= Number.MIN_SAFE_INTEGER) return this.encodeNint(Number(int));
			const uint = -BigInt(1) - int;
			this.writer.u8u64(59, uint);
		}
		writeInteger(int) {
			if (int >= 0) this.writeUInteger(int);
			else this.encodeNint(int);
		}
		writeUInteger(uint) {
			const writer = this.writer;
			writer.ensureCapacity(9);
			const uint8 = writer.uint8;
			let x = writer.x;
			if (uint <= 23) uint8[x++] = 0 + uint;
			else if (uint <= 255) {
				uint8[x++] = 24;
				uint8[x++] = uint;
			} else if (uint <= 65535) {
				uint8[x++] = 25;
				writer.view.setUint16(x, uint);
				x += 2;
			} else if (uint <= 4294967295) {
				uint8[x++] = 26;
				writer.view.setUint32(x, uint);
				x += 4;
			} else {
				uint8[x++] = 27;
				writer.view.setBigUint64(x, BigInt(uint));
				x += 8;
			}
			writer.x = x;
		}
		encodeNumber(num) {
			this.writeNumber(num);
		}
		encodeInteger(int) {
			this.writeInteger(int);
		}
		encodeUint(uint) {
			this.writeUInteger(uint);
		}
		encodeNint(int) {
			const uint = -1 - int;
			const writer = this.writer;
			writer.ensureCapacity(9);
			const uint8 = writer.uint8;
			let x = writer.x;
			if (uint < 24) uint8[x++] = 32 + uint;
			else if (uint <= 255) {
				uint8[x++] = 56;
				uint8[x++] = uint;
			} else if (uint <= 65535) {
				uint8[x++] = 57;
				writer.view.setUint16(x, uint);
				x += 2;
			} else if (uint <= 4294967295) {
				uint8[x++] = 58;
				writer.view.setUint32(x, uint);
				x += 4;
			} else {
				uint8[x++] = 59;
				writer.view.setBigUint64(x, BigInt(uint));
				x += 8;
			}
			writer.x = x;
		}
		writeFloat(float) {
			this.writer.u8f64(251, float);
		}
		writeBin(buf) {
			const length = buf.length;
			this.writeBinHdr(length);
			this.writer.buf(buf, length);
		}
		writeBinHdr(length) {
			const writer = this.writer;
			if (length <= 23) writer.u8(64 + length);
			else if (length <= 255) writer.u16(22528 + length);
			else if (length <= 65535) writer.u8u16(89, length);
			else if (length <= 4294967295) writer.u8u32(90, length);
			else writer.u8u64(91, length);
		}
		writeStr(str) {
			const writer = this.writer;
			const maxSize = str.length * 4;
			writer.ensureCapacity(5 + maxSize);
			const uint8 = writer.uint8;
			let lengthOffset = writer.x;
			if (maxSize <= 23) writer.x++;
			else if (maxSize <= 255) {
				uint8[writer.x++] = 120;
				lengthOffset = writer.x;
				writer.x++;
			} else if (maxSize <= 65535) {
				uint8[writer.x++] = 121;
				lengthOffset = writer.x;
				writer.x += 2;
			} else {
				uint8[writer.x++] = 122;
				lengthOffset = writer.x;
				writer.x += 4;
			}
			const bytesWritten = writer.utf8(str);
			if (maxSize <= 23) uint8[lengthOffset] = 96 + bytesWritten;
			else if (maxSize <= 255) uint8[lengthOffset] = bytesWritten;
			else if (maxSize <= 65535) writer.view.setUint16(lengthOffset, bytesWritten);
			else writer.view.setUint32(lengthOffset, bytesWritten);
		}
		writeStrHdr(length) {
			const writer = this.writer;
			if (length <= 23) writer.u8(96 + length);
			else if (length <= 255) writer.u16(30720 + length);
			else if (length <= 65535) writer.u8u16(121, length);
			else writer.u8u32(122, length);
		}
		writeAsciiStr(str) {
			this.writeStrHdr(str.length);
			this.writer.ascii(str);
		}
		writeArr(arr) {
			const length = arr.length;
			this.writeArrHdr(length);
			for (let i = 0; i < length; i++) this.writeAny(arr[i]);
		}
		writeArrHdr(length) {
			const writer = this.writer;
			if (length <= 23) writer.u8(128 + length);
			else if (length <= 255) writer.u16(38912 + length);
			else if (length <= 65535) writer.u8u16(153, length);
			else if (length <= 4294967295) writer.u8u32(154, length);
			else writer.u8u64(155, length);
		}
		writeObj(obj) {
			const keys = Object.keys(obj);
			const length = keys.length;
			this.writeObjHdr(length);
			for (let i = 0; i < length; i++) {
				const key = keys[i];
				this.writeStr(key);
				this.writeAny(obj[key]);
			}
		}
		writeObjHdr(length) {
			const writer = this.writer;
			if (length <= 23) writer.u8(160 + length);
			else if (length <= 255) writer.u16(47104 + length);
			else if (length <= 65535) writer.u8u16(185, length);
			else if (length <= 4294967295) writer.u8u32(186, length);
			else writer.u8u64(187, length);
		}
		writeMapHdr(length) {
			this.writeObjHdr(length);
		}
		writeStartMap() {
			this.writer.u8(191);
		}
		writeTag(tag, value) {
			this.writeTagHdr(tag);
			this.writeAny(value);
		}
		writeTagHdr(tag) {
			const writer = this.writer;
			if (tag <= 23) writer.u8(192 + tag);
			else if (tag <= 255) writer.u16(55296 + tag);
			else if (tag <= 65535) writer.u8u16(217, tag);
			else if (tag <= 4294967295) writer.u8u32(218, tag);
			else writer.u8u64(219, tag);
		}
		writeTkn(value) {
			const writer = this.writer;
			if (value <= 23) writer.u8(224 + value);
			else if (value <= 255) writer.u16(63488 + value);
		}
		writeStartStr() {
			this.writer.u8(127);
		}
		writeStrChunk(str) {
			throw new Error("Not implemented");
		}
		writeEndStr() {
			throw new Error("Not implemented");
		}
		writeStartBin() {
			this.writer.u8(95);
		}
		writeBinChunk(buf) {
			throw new Error("Not implemented");
		}
		writeEndBin() {
			throw new Error("Not implemented");
		}
		writeStartArr() {
			this.writer.u8(159);
		}
		writeArrChunk(item) {
			throw new Error("Not implemented");
		}
		writeEndArr() {
			this.writer.u8(255);
		}
		writeStartObj() {
			this.writer.u8(191);
		}
		writeObjChunk(key, value) {
			throw new Error("Not implemented");
		}
		writeEndObj() {
			this.writer.u8(255);
		}
	};
	exports.CborEncoderFast = CborEncoderFast;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+json-pack@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/json-pack/lib/JsonPackValue.js
var require_JsonPackValue = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.JsonPackValue = void 0;
	var JsonPackValue = class {
		constructor(val) {
			this.val = val;
		}
	};
	exports.JsonPackValue = JsonPackValue;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+json-pack@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/json-pack/lib/cbor/CborEncoder.js
var require_CborEncoder = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.CborEncoder = void 0;
	const isFloat32_1 = require_isFloat32();
	const JsonPackExtension_1 = require_JsonPackExtension();
	const CborEncoderFast_1 = require_CborEncoderFast();
	const JsonPackValue_1 = require_JsonPackValue();
	var CborEncoder = class extends CborEncoderFast_1.CborEncoderFast {
		writeUnknown(value) {
			this.writeNull();
		}
		writeAny(value) {
			switch (typeof value) {
				case "number": return this.writeNumber(value);
				case "string": return this.writeStr(value);
				case "boolean": return this.writer.u8(244 + +value);
				case "object":
					if (!value) return this.writer.u8(246);
					switch (value.constructor) {
						case Object: return this.writeObj(value);
						case Array: return this.writeArr(value);
						case Uint8Array: return this.writeBin(value);
						case Map: return this.writeMap(value);
						case JsonPackExtension_1.JsonPackExtension: return this.writeTag(value.tag, value.val);
						case JsonPackValue_1.JsonPackValue: {
							const buf = value.val;
							return this.writer.buf(buf, buf.length);
						}
						default:
							if (value instanceof Uint8Array) return this.writeBin(value);
							if (Array.isArray(value)) return this.writeArr(value);
							if (value instanceof Map) return this.writeMap(value);
							return this.writeUnknown(value);
					}
				case "undefined": return this.writeUndef();
				case "bigint": return this.writeBigInt(value);
				default: return this.writeUnknown(value);
			}
		}
		writeFloat(float) {
			if ((0, isFloat32_1.isFloat32)(float)) this.writer.u8f32(250, float);
			else this.writer.u8f64(251, float);
		}
		writeMap(map) {
			this.writeMapHdr(map.size);
			map.forEach((value, key) => {
				this.writeAny(key);
				this.writeAny(value);
			});
		}
		writeUndef() {
			this.writer.u8(247);
		}
	};
	exports.CborEncoder = CborEncoder;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+buffers@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/buffers/lib/f16.js
var require_f16 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.decodeF16 = void 0;
	const pow = Math.pow;
	const decodeF16 = (binary) => {
		const exponent = (binary & 31744) >> 10;
		const fraction = binary & 1023;
		return (binary >> 15 ? -1 : 1) * (exponent ? exponent === 31 ? fraction ? NaN : Infinity : pow(2, exponent - 15) * (1 + fraction / 1024) : 6103515625e-14 * (fraction / 1024));
	};
	exports.decodeF16 = decodeF16;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+buffers@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/buffers/lib/utf8/decodeAscii.js
var require_decodeAscii = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.decodeAsciiMax15 = exports.decodeAscii = void 0;
	const fromCharCode = String.fromCharCode;
	const decodeAscii = (src, position, length) => {
		const bytes = [];
		for (let i = 0; i < length; i++) {
			const byte = src[position++];
			if (byte & 128) return;
			bytes.push(byte);
		}
		return fromCharCode.apply(String, bytes);
	};
	exports.decodeAscii = decodeAscii;
	const decodeAsciiMax15 = (src, position, length) => {
		if (length < 4) {
			if (length < 2) {
				if (length === 0) return "";
				else {
					const a = src[position++];
					if ((a & 128) > 1) {
						position -= 1;
						return;
					}
					return fromCharCode(a);
				}
			} else {
				const a = src[position++];
				const b = src[position++];
				if ((a & 128) > 0 || (b & 128) > 0) {
					position -= 2;
					return;
				}
				if (length < 3) return fromCharCode(a, b);
				const c = src[position++];
				if ((c & 128) > 0) {
					position -= 3;
					return;
				}
				return fromCharCode(a, b, c);
			}
		} else {
			const a = src[position++];
			const b = src[position++];
			const c = src[position++];
			const d = src[position++];
			if ((a & 128) > 0 || (b & 128) > 0 || (c & 128) > 0 || (d & 128) > 0) {
				position -= 4;
				return;
			}
			if (length < 6) {
				if (length === 4) return fromCharCode(a, b, c, d);
				else {
					const e = src[position++];
					if ((e & 128) > 0) {
						position -= 5;
						return;
					}
					return fromCharCode(a, b, c, d, e);
				}
			} else if (length < 8) {
				const e = src[position++];
				const f = src[position++];
				if ((e & 128) > 0 || (f & 128) > 0) {
					position -= 6;
					return;
				}
				if (length < 7) return fromCharCode(a, b, c, d, e, f);
				const g = src[position++];
				if ((g & 128) > 0) {
					position -= 7;
					return;
				}
				return fromCharCode(a, b, c, d, e, f, g);
			} else {
				const e = src[position++];
				const f = src[position++];
				const g = src[position++];
				const h = src[position++];
				if ((e & 128) > 0 || (f & 128) > 0 || (g & 128) > 0 || (h & 128) > 0) {
					position -= 8;
					return;
				}
				if (length < 10) {
					if (length === 8) return fromCharCode(a, b, c, d, e, f, g, h);
					else {
						const i = src[position++];
						if ((i & 128) > 0) {
							position -= 9;
							return;
						}
						return fromCharCode(a, b, c, d, e, f, g, h, i);
					}
				} else if (length < 12) {
					const i = src[position++];
					const j = src[position++];
					if ((i & 128) > 0 || (j & 128) > 0) {
						position -= 10;
						return;
					}
					if (length < 11) return fromCharCode(a, b, c, d, e, f, g, h, i, j);
					const k = src[position++];
					if ((k & 128) > 0) {
						position -= 11;
						return;
					}
					return fromCharCode(a, b, c, d, e, f, g, h, i, j, k);
				} else {
					const i = src[position++];
					const j = src[position++];
					const k = src[position++];
					const l = src[position++];
					if ((i & 128) > 0 || (j & 128) > 0 || (k & 128) > 0 || (l & 128) > 0) {
						position -= 12;
						return;
					}
					if (length < 14) {
						if (length === 12) return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l);
						else {
							const m = src[position++];
							if ((m & 128) > 0) {
								position -= 13;
								return;
							}
							return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l, m);
						}
					} else {
						const m = src[position++];
						const n = src[position++];
						if ((m & 128) > 0 || (n & 128) > 0) {
							position -= 14;
							return;
						}
						if (length < 15) return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l, m, n);
						const o = src[position++];
						if ((o & 128) > 0) {
							position -= 15;
							return;
						}
						return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o);
					}
				}
			}
		}
	};
	exports.decodeAsciiMax15 = decodeAsciiMax15;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+buffers@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/buffers/lib/utf8/decodeUtf8/v18.js
var require_v18 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const fromCharCode = String.fromCharCode;
	exports.default = (buf, start, length) => {
		let offset = start;
		const end = offset + length;
		const points = [];
		while (offset < end) {
			let code = buf[offset++];
			if ((code & 128) !== 0) {
				const octet2 = buf[offset++] & 63;
				if ((code & 224) === 192) code = (code & 31) << 6 | octet2;
				else {
					const octet3 = buf[offset++] & 63;
					if ((code & 240) === 224) code = (code & 31) << 12 | octet2 << 6 | octet3;
					else if ((code & 248) === 240) {
						const octet4 = buf[offset++] & 63;
						let unit = (code & 7) << 18 | octet2 << 12 | octet3 << 6 | octet4;
						if (unit > 65535) {
							unit -= 65536;
							const unit0 = unit >>> 10 & 1023 | 55296;
							code = 56320 | unit & 1023;
							points.push(unit0);
						} else code = unit;
					}
				}
			}
			points.push(code);
		}
		return fromCharCode.apply(String, points);
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+buffers@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/buffers/lib/utf8/decodeUtf8/v16.js
var require_v16 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
	const decodeAscii_1 = require_decodeAscii();
	const v18_1 = tslib_1.__importDefault(require_v18());
	const hasBuffer = typeof Buffer !== "undefined";
	const utf8Slice = hasBuffer ? Buffer.prototype.utf8Slice : null;
	const from = hasBuffer ? Buffer.from : null;
	const shortDecoder = (buf, start, length) => (0, decodeAscii_1.decodeAsciiMax15)(buf, start, length) ?? (0, v18_1.default)(buf, start, length);
	const midDecoder = (buf, start, length) => (0, decodeAscii_1.decodeAscii)(buf, start, length) ?? (0, v18_1.default)(buf, start, length);
	const longDecoder = utf8Slice ? (buf, start, length) => utf8Slice.call(buf, start, start + length) : from ? (buf, start, length) => from(buf).subarray(start, start + length).toString("utf8") : v18_1.default;
	const decoder = (buf, start, length) => {
		if (length < 16) return shortDecoder(buf, start, length);
		if (length < 32) return midDecoder(buf, start, length);
		return longDecoder(buf, start, length);
	};
	exports.default = decoder;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+buffers@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/buffers/lib/utf8/decodeUtf8/index.js
var require_decodeUtf8 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.decodeUtf8 = void 0;
	exports.decodeUtf8 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports)).__importDefault(require_v16()).default;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+buffers@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/buffers/lib/Reader.js
var require_Reader = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Reader = void 0;
	const decodeUtf8_1 = require_decodeUtf8();
	exports.Reader = class Reader {
		constructor(uint8 = new Uint8Array([]), view = new DataView(uint8.buffer, uint8.byteOffset, uint8.length), x = 0, end = uint8.length) {
			this.uint8 = uint8;
			this.view = view;
			this.x = x;
			this.end = end;
		}
		reset(uint8) {
			this.x = 0;
			this.uint8 = uint8;
			this.view = new DataView(uint8.buffer, uint8.byteOffset, uint8.length);
		}
		size() {
			return this.end - this.x;
		}
		peek() {
			return this.view.getUint8(this.x);
		}
		peak() {
			return this.peek();
		}
		skip(length) {
			this.x += length;
		}
		buf(size = this.size()) {
			const x = this.x;
			const end = x + size;
			const bin = this.uint8.subarray(x, end);
			this.x = end;
			return bin;
		}
		subarray(start = 0, end) {
			const x = this.x;
			const actualStart = x + start;
			const actualEnd = typeof end === "number" ? x + end : this.end;
			return this.uint8.subarray(actualStart, actualEnd);
		}
		slice(start = 0, end) {
			const x = this.x;
			const actualStart = x + start;
			const actualEnd = typeof end === "number" ? x + end : this.end;
			return new Reader(this.uint8, this.view, actualStart, actualEnd);
		}
		cut(size = this.size()) {
			const slice = this.slice(0, size);
			this.skip(size);
			return slice;
		}
		u8() {
			return this.uint8[this.x++];
		}
		i8() {
			return this.view.getInt8(this.x++);
		}
		u16() {
			let x = this.x;
			const num = (this.uint8[x++] << 8) + this.uint8[x++];
			this.x = x;
			return num;
		}
		i16() {
			const num = this.view.getInt16(this.x);
			this.x += 2;
			return num;
		}
		u32() {
			const num = this.view.getUint32(this.x);
			this.x += 4;
			return num;
		}
		i32() {
			const num = this.view.getInt32(this.x);
			this.x += 4;
			return num;
		}
		u64() {
			const num = this.view.getBigUint64(this.x);
			this.x += 8;
			return num;
		}
		i64() {
			const num = this.view.getBigInt64(this.x);
			this.x += 8;
			return num;
		}
		f32() {
			const pos = this.x;
			this.x += 4;
			return this.view.getFloat32(pos);
		}
		f64() {
			const pos = this.x;
			this.x += 8;
			return this.view.getFloat64(pos);
		}
		utf8(size) {
			const start = this.x;
			this.x += size;
			return (0, decodeUtf8_1.decodeUtf8)(this.uint8, start, size);
		}
		ascii(length) {
			const uint8 = this.uint8;
			let str = "";
			const end = this.x + length;
			for (let i = this.x; i < end; i++) str += String.fromCharCode(uint8[i]);
			this.x = end;
			return str;
		}
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+buffers@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/buffers/lib/utf8/decodeUtf8/v10.js
var require_v10 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const fromCharCode = String.fromCharCode;
	exports.default = (buf, start, length) => {
		let offset = start;
		const end = offset + length;
		let str = "";
		while (offset < end) {
			const octet1 = buf[offset++];
			if ((octet1 & 128) === 0) {
				str += fromCharCode(octet1);
				continue;
			}
			const octet2 = buf[offset++] & 63;
			if ((octet1 & 224) === 192) {
				str += fromCharCode((octet1 & 31) << 6 | octet2);
				continue;
			}
			const octet3 = buf[offset++] & 63;
			if ((octet1 & 240) === 224) {
				str += fromCharCode((octet1 & 31) << 12 | octet2 << 6 | octet3);
				continue;
			}
			if ((octet1 & 248) === 240) {
				const octet4 = buf[offset++] & 63;
				let unit = (octet1 & 7) << 18 | octet2 << 12 | octet3 << 6 | octet4;
				if (unit > 65535) {
					unit -= 65536;
					const unit0 = unit >>> 10 & 1023 | 55296;
					unit = 56320 | unit & 1023;
					str += fromCharCode(unit0, unit);
				} else str += fromCharCode(unit);
			} else str += fromCharCode(octet1);
		}
		return str;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+buffers@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/buffers/lib/utf8/CachedUtf8Decoder.js
var require_CachedUtf8Decoder = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.CachedUtf8Decoder = void 0;
	const v10_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports)).__importDefault(require_v10());
	let x = 1 + Math.round(Math.random() * ((-1 >>> 0) - 1));
	function randomU32(min, max) {
		x ^= x << 13;
		x ^= x >>> 17;
		x ^= x << 5;
		return (x >>> 0) % (max - min + 1) + min;
	}
	var CacheItem = class {
		constructor(bytes, value) {
			this.bytes = bytes;
			this.value = value;
		}
	};
	var CachedUtf8Decoder = class {
		constructor() {
			this.caches = [];
			for (let i = 0; i < 31; i++) this.caches.push([]);
		}
		get(bytes, offset, size) {
			const records = this.caches[size - 1];
			const len = records.length;
			FIND_CHUNK: for (let i = 0; i < len; i++) {
				const record = records[i];
				const recordBytes = record.bytes;
				for (let j = 0; j < size; j++) if (recordBytes[j] !== bytes[offset + j]) continue FIND_CHUNK;
				return record.value;
			}
			return null;
		}
		store(bytes, value) {
			const records = this.caches[bytes.length - 1];
			const record = new CacheItem(bytes, value);
			if (records.length >= 16) records[randomU32(0, 15)] = record;
			else records.push(record);
		}
		decode(bytes, offset, size) {
			if (!size) return "";
			const cachedValue = this.get(bytes, offset, size);
			if (cachedValue !== null) return cachedValue;
			const value = (0, v10_1.default)(bytes, offset, size);
			const copy = Uint8Array.prototype.slice.call(bytes, offset, offset + size);
			this.store(copy, value);
			return value;
		}
	};
	exports.CachedUtf8Decoder = CachedUtf8Decoder;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+buffers@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/buffers/lib/utf8/sharedCachedUtf8Decoder.js
var require_sharedCachedUtf8Decoder = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.default = new (require_CachedUtf8Decoder()).CachedUtf8Decoder();
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+json-pack@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/json-pack/lib/cbor/CborDecoderBase.js
var require_CborDecoderBase = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.CborDecoderBase = void 0;
	const tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
	const f16_1 = require_f16();
	const JsonPackExtension_1 = require_JsonPackExtension();
	const JsonPackValue_1 = require_JsonPackValue();
	const Reader_1 = require_Reader();
	const sharedCachedUtf8Decoder_1 = tslib_1.__importDefault(require_sharedCachedUtf8Decoder());
	var CborDecoderBase = class {
		constructor(reader = new Reader_1.Reader(), keyDecoder = sharedCachedUtf8Decoder_1.default) {
			this.reader = reader;
			this.keyDecoder = keyDecoder;
		}
		read(uint8) {
			this.reader.reset(uint8);
			return this.readAny();
		}
		decode(uint8) {
			this.reader.reset(uint8);
			return this.readAny();
		}
		val() {
			return this.readAny();
		}
		readAny() {
			const octet = this.reader.u8();
			const major = octet >> 5;
			const minor = octet & 31;
			if (major < 4) {
				if (major < 2) return major === 0 ? this.readUint(minor) : this.readNint(minor);
				else return major === 2 ? this.readBin(minor) : this.readStr(minor);
			} else if (major < 6) return major === 4 ? this.readArr(minor) : this.readObj(minor);
			else return major === 6 ? this.readTag(minor) : this.readTkn(minor);
		}
		readAnyRaw(octet) {
			const major = octet >> 5;
			const minor = octet & 31;
			if (major < 4) {
				if (major < 2) return major === 0 ? this.readUint(minor) : this.readNint(minor);
				else return major === 2 ? this.readBin(minor) : this.readStr(minor);
			} else if (major < 6) return major === 4 ? this.readArr(minor) : this.readObj(minor);
			else return major === 6 ? this.readTag(minor) : this.readTkn(minor);
		}
		readMinorLen(minor) {
			if (minor < 24) return minor;
			switch (minor) {
				case 24: return this.reader.u8();
				case 25: return this.reader.u16();
				case 26: return this.reader.u32();
				case 27: return Number(this.reader.u64());
				case 31: return -1;
				default: throw 1;
			}
		}
		readUint(minor) {
			if (minor < 25) return minor === 24 ? this.reader.u8() : minor;
			else if (minor < 27) return minor === 25 ? this.reader.u16() : this.reader.u32();
			else {
				const num = this.reader.u64();
				return num > 9007199254740991 ? num : Number(num);
			}
		}
		readNint(minor) {
			if (minor < 25) return minor === 24 ? -this.reader.u8() - 1 : -minor - 1;
			else if (minor < 27) return minor === 25 ? -this.reader.u16() - 1 : -this.reader.u32() - 1;
			else {
				const num = this.reader.u64();
				return num > 9007199254740990 ? -num - BigInt(1) : -Number(num) - 1;
			}
		}
		readBin(minor) {
			const reader = this.reader;
			if (minor <= 23) return reader.buf(minor);
			switch (minor) {
				case 24: return reader.buf(reader.u8());
				case 25: return reader.buf(reader.u16());
				case 26: return reader.buf(reader.u32());
				case 27: return reader.buf(Number(reader.u64()));
				case 31: {
					let size = 0;
					const list = [];
					while (this.reader.peak() !== 255) {
						const uint8 = this.readBinChunk();
						size += uint8.length;
						list.push(uint8);
					}
					this.reader.x++;
					const res = new Uint8Array(size);
					let offset = 0;
					const length = list.length;
					for (let i = 0; i < length; i++) {
						const arr = list[i];
						res.set(arr, offset);
						offset += arr.length;
					}
					return res;
				}
				default: throw 1;
			}
		}
		readBinChunk() {
			const octet = this.reader.u8();
			const major = octet >> 5;
			const minor = octet & 31;
			if (major !== 2) throw 2;
			if (minor > 27) throw 3;
			return this.readBin(minor);
		}
		readAsStr() {
			const octet = this.reader.u8();
			const major = octet >> 5;
			const minor = octet & 31;
			if (major !== 3) throw 11;
			return this.readStr(minor);
		}
		readStr(minor) {
			const reader = this.reader;
			if (minor <= 23) return reader.utf8(minor);
			switch (minor) {
				case 24: return reader.utf8(reader.u8());
				case 25: return reader.utf8(reader.u16());
				case 26: return reader.utf8(reader.u32());
				case 27: return reader.utf8(Number(reader.u64()));
				case 31: {
					let str = "";
					while (reader.peak() !== 255) str += this.readStrChunk();
					this.reader.x++;
					return str;
				}
				default: throw 1;
			}
		}
		readStrLen(minor) {
			if (minor <= 23) return minor;
			switch (minor) {
				case 24: return this.reader.u8();
				case 25: return this.reader.u16();
				case 26: return this.reader.u32();
				case 27: return Number(this.reader.u64());
				default: throw 1;
			}
		}
		readStrChunk() {
			const octet = this.reader.u8();
			const major = octet >> 5;
			const minor = octet & 31;
			if (major !== 3) throw 4;
			if (minor > 27) throw 5;
			return this.readStr(minor);
		}
		readArr(minor) {
			const length = this.readMinorLen(minor);
			if (length >= 0) return this.readArrRaw(length);
			return this.readArrIndef();
		}
		readArrRaw(length) {
			const arr = [];
			for (let i = 0; i < length; i++) arr.push(this.readAny());
			return arr;
		}
		readArrIndef() {
			const arr = [];
			while (this.reader.peak() !== 255) arr.push(this.readAny());
			this.reader.x++;
			return arr;
		}
		readObj(minor) {
			if (minor < 28) {
				let length = minor;
				switch (minor) {
					case 24:
						length = this.reader.u8();
						break;
					case 25:
						length = this.reader.u16();
						break;
					case 26:
						length = this.reader.u32();
						break;
					case 27: length = Number(this.reader.u64());
				}
				const obj = {};
				for (let i = 0; i < length; i++) {
					const key = this.key();
					if (key === "__proto__") throw 6;
					obj[key] = this.readAny();
				}
				return obj;
			} else if (minor === 31) return this.readObjIndef();
			else throw 1;
		}
		readObjRaw(length) {
			const obj = {};
			for (let i = 0; i < length; i++) {
				const key = this.key();
				obj[key] = this.readAny();
			}
			return obj;
		}
		readObjIndef() {
			const obj = {};
			while (this.reader.peak() !== 255) {
				const key = this.key();
				if (this.reader.peak() === 255) throw 7;
				obj[key] = this.readAny();
			}
			this.reader.x++;
			return obj;
		}
		key() {
			const octet = this.reader.u8();
			const major = octet >> 5;
			const minor = octet & 31;
			if (major !== 3) return String(this.readAnyRaw(octet));
			const length = this.readStrLen(minor);
			if (length > 31) return this.reader.utf8(length);
			const key = this.keyDecoder.decode(this.reader.uint8, this.reader.x, length);
			this.reader.skip(length);
			return key;
		}
		readTag(minor) {
			if (minor <= 23) return this.readTagRaw(minor);
			switch (minor) {
				case 24: return this.readTagRaw(this.reader.u8());
				case 25: return this.readTagRaw(this.reader.u16());
				case 26: return this.readTagRaw(this.reader.u32());
				case 27: return this.readTagRaw(Number(this.reader.u64()));
				default: throw 1;
			}
		}
		readTagRaw(tag) {
			return new JsonPackExtension_1.JsonPackExtension(tag, this.readAny());
		}
		readTkn(minor) {
			switch (minor) {
				case 20: return false;
				case 21: return true;
				case 22: return null;
				case 23: return;
				case 24: return new JsonPackValue_1.JsonPackValue(this.reader.u8());
				case 25: return this.f16();
				case 26: return this.reader.f32();
				case 27: return this.reader.f64();
			}
			if (minor <= 23) return new JsonPackValue_1.JsonPackValue(minor);
			throw 1;
		}
		f16() {
			return (0, f16_1.decodeF16)(this.reader.u16());
		}
	};
	exports.CborDecoderBase = CborDecoderBase;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+json-pack@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/json-pack/lib/cbor/CborDecoder.js
var require_CborDecoder = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.CborDecoder = void 0;
	const CborDecoderBase_1 = require_CborDecoderBase();
	const JsonPackValue_1 = require_JsonPackValue();
	var CborDecoder = class extends CborDecoderBase_1.CborDecoderBase {
		readAsMap() {
			const octet = this.reader.u8();
			const major = octet >> 5;
			const minor = octet & 31;
			switch (major) {
				case 5: return this.readMap(minor);
				default: throw 0;
			}
		}
		readMap(minor) {
			const length = this.readMinorLen(minor);
			if (length >= 0) return this.readMapRaw(length);
			else return this.readMapIndef();
		}
		readMapRaw(length) {
			const map = /* @__PURE__ */ new Map();
			for (let i = 0; i < length; i++) {
				const key = this.readAny();
				const value = this.readAny();
				map.set(key, value);
			}
			return map;
		}
		readMapIndef() {
			const map = /* @__PURE__ */ new Map();
			while (this.reader.peak() !== 255) {
				const key = this.readAny();
				if (this.reader.peak() === 255) throw 7;
				const value = this.readAny();
				map.set(key, value);
			}
			this.reader.x++;
			return map;
		}
		skipN(n) {
			for (let i = 0; i < n; i++) this.skipAny();
		}
		skipAny() {
			this.skipAnyRaw(this.reader.u8());
		}
		skipAnyRaw(octet) {
			const major = octet >> 5;
			const minor = octet & 31;
			switch (major) {
				case 0:
				case 1:
					this.skipUNint(minor);
					break;
				case 2:
					this.skipBin(minor);
					break;
				case 3:
					this.skipStr(minor);
					break;
				case 4:
					this.skipArr(minor);
					break;
				case 5:
					this.skipObj(minor);
					break;
				case 7:
					this.skipTkn(minor);
					break;
				case 6: this.skipTag(minor);
			}
		}
		skipMinorLen(minor) {
			if (minor <= 23) return minor;
			switch (minor) {
				case 24: return this.reader.u8();
				case 25: return this.reader.u16();
				case 26: return this.reader.u32();
				case 27: return Number(this.reader.u64());
				case 31: return -1;
				default: throw 1;
			}
		}
		skipUNint(minor) {
			if (minor <= 23) return;
			switch (minor) {
				case 24: return this.reader.skip(1);
				case 25: return this.reader.skip(2);
				case 26: return this.reader.skip(4);
				case 27: return this.reader.skip(8);
				default: throw 1;
			}
		}
		skipBin(minor) {
			const length = this.skipMinorLen(minor);
			if (length >= 0) this.reader.skip(length);
			else {
				while (this.reader.peak() !== 255) this.skipBinChunk();
				this.reader.x++;
			}
		}
		skipBinChunk() {
			const octet = this.reader.u8();
			const major = octet >> 5;
			const minor = octet & 31;
			if (major !== 2) throw 2;
			if (minor > 27) throw 3;
			this.skipBin(minor);
		}
		skipStr(minor) {
			const length = this.skipMinorLen(minor);
			if (length >= 0) this.reader.skip(length);
			else {
				while (this.reader.peak() !== 255) this.skipStrChunk();
				this.reader.x++;
			}
		}
		skipStrChunk() {
			const octet = this.reader.u8();
			const major = octet >> 5;
			const minor = octet & 31;
			if (major !== 3) throw 4;
			if (minor > 27) throw 5;
			this.skipStr(minor);
		}
		skipArr(minor) {
			const length = this.skipMinorLen(minor);
			if (length >= 0) this.skipN(length);
			else {
				while (this.reader.peak() !== 255) this.skipAny();
				this.reader.x++;
			}
		}
		skipObj(minor) {
			const length = this.readMinorLen(minor);
			if (length >= 0) return this.skipN(length * 2);
			else {
				while (this.reader.peak() !== 255) {
					this.skipAny();
					if (this.reader.peak() === 255) throw 7;
					this.skipAny();
				}
				this.reader.x++;
			}
		}
		skipTag(minor) {
			if (this.skipMinorLen(minor) < 0) throw 1;
			this.skipAny();
		}
		skipTkn(minor) {
			switch (minor) {
				case 24:
					this.reader.skip(1);
					return;
				case 25:
					this.reader.skip(2);
					return;
				case 26:
					this.reader.skip(4);
					return;
				case 27:
					this.reader.skip(8);
					return;
			}
			if (minor <= 23) return;
			throw 1;
		}
		validate(value, offset = 0, size = value.length) {
			this.reader.reset(value);
			this.reader.x = offset;
			const start = offset;
			this.skipAny();
			if (this.reader.x - start !== size) throw 8;
		}
		decodeLevel(value) {
			this.reader.reset(value);
			return this.readLevel();
		}
		readLevel() {
			const octet = this.reader.u8();
			const major = octet >> 5;
			const minor = octet & 31;
			switch (major) {
				case 4: return this.readArrLevel(minor);
				case 5: return this.readObjLevel(minor);
				default: return super.readAnyRaw(octet);
			}
		}
		readPrimitiveOrVal() {
			switch (this.reader.peak() >> 5) {
				case 4:
				case 5: return this.readAsValue();
				default: return this.readAny();
			}
		}
		readAsValue() {
			const reader = this.reader;
			const start = reader.x;
			this.skipAny();
			const end = reader.x;
			return new JsonPackValue_1.JsonPackValue(reader.uint8.subarray(start, end));
		}
		readObjLevel(minor) {
			const length = this.readMinorLen(minor);
			if (length >= 0) return this.readObjRawLevel(length);
			else return this.readObjIndefLevel();
		}
		readObjRawLevel(length) {
			const obj = {};
			for (let i = 0; i < length; i++) {
				const key = this.key();
				obj[key] = this.readPrimitiveOrVal();
			}
			return obj;
		}
		readObjIndefLevel() {
			const obj = {};
			while (this.reader.peak() !== 255) {
				const key = this.key();
				if (this.reader.peak() === 255) throw 7;
				obj[key] = this.readPrimitiveOrVal();
			}
			this.reader.x++;
			return obj;
		}
		readArrLevel(minor) {
			const length = this.readMinorLen(minor);
			if (length >= 0) return this.readArrRawLevel(length);
			return this.readArrIndefLevel();
		}
		readArrRawLevel(length) {
			const arr = [];
			for (let i = 0; i < length; i++) arr.push(this.readPrimitiveOrVal());
			return arr;
		}
		readArrIndefLevel() {
			const arr = [];
			while (this.reader.peak() !== 255) arr.push(this.readPrimitiveOrVal());
			this.reader.x++;
			return arr;
		}
		readHdr(expectedMajor) {
			const octet = this.reader.u8();
			if (octet >> 5 !== expectedMajor) throw 0;
			const minor = octet & 31;
			if (minor < 24) return minor;
			switch (minor) {
				case 24: return this.reader.u8();
				case 25: return this.reader.u16();
				case 26: return this.reader.u32();
				case 27: return Number(this.reader.u64());
				case 31: return -1;
			}
			throw 1;
		}
		readStrHdr() {
			return this.readHdr(3);
		}
		readObjHdr() {
			return this.readHdr(5);
		}
		readArrHdr() {
			return this.readHdr(4);
		}
		findKey(key) {
			const size = this.readObjHdr();
			for (let i = 0; i < size; i++) {
				if (this.key() === key) return this;
				this.skipAny();
			}
			throw 9;
		}
		findIndex(index) {
			if (index >= this.readArrHdr()) throw 10;
			for (let i = 0; i < index; i++) this.skipAny();
			return this;
		}
		find(path) {
			for (let i = 0; i < path.length; i++) {
				const segment = path[i];
				if (typeof segment === "string") this.findKey(segment);
				else this.findIndex(segment);
			}
			return this;
		}
	};
	exports.CborDecoder = CborDecoder;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-snapshot@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-snapshot/lib/async.js
var require_async = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.fromSnapshot = exports.toSnapshot = void 0;
	const shared_1 = require_shared();
	const toSnapshot = async ({ fs, path = "/", separator = "/" }) => {
		const stats = await fs.lstat(path);
		if (stats.isDirectory()) {
			const list = await fs.readdir(path);
			const entries = {};
			const dir = path.endsWith(separator) ? path : path + separator;
			const snapshots = await Promise.all(list.map((child) => (0, exports.toSnapshot)({
				fs,
				path: `${dir}${child}`,
				separator
			})));
			for (let i = 0; i < list.length; i++) if (snapshots[i]) entries["" + list[i]] = snapshots[i];
			return [
				0,
				{},
				entries
			];
		} else if (stats.isFile()) {
			const buf = await fs.readFile(path);
			return [
				1,
				{},
				new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
			];
		} else if (stats.isSymbolicLink()) return [2, { target: await fs.readlink(path, { encoding: "utf8" }) }];
		return null;
	};
	exports.toSnapshot = toSnapshot;
	const fromSnapshot = async (snapshot, { fs, path = "/", separator = "/" }) => {
		if (!snapshot) return;
		switch (snapshot[0]) {
			case 0: {
				if (!path.endsWith(separator)) path = path + separator;
				const [, , entries] = snapshot;
				await fs.mkdir(path, { recursive: true });
				for (const [name, child] of Object.entries(entries)) {
					(0, shared_1.validateEntryName)(name);
					await (0, exports.fromSnapshot)(child, {
						fs,
						path: `${path}${name}`,
						separator
					});
				}
				break;
			}
			case 1: {
				const [, , data] = snapshot;
				await fs.writeFile(path, data);
				break;
			}
			case 2: {
				const [, { target }] = snapshot;
				await fs.symlink(target, path);
				break;
			}
		}
	};
	exports.fromSnapshot = fromSnapshot;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-snapshot@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-snapshot/lib/binary.js
var require_binary = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.fromBinarySnapshot = exports.toBinarySnapshot = exports.fromBinarySnapshotSync = exports.toBinarySnapshotSync = void 0;
	const CborEncoder_1 = require_CborEncoder();
	const CborDecoder_1 = require_CborDecoder();
	const sync_1 = require_sync();
	const async_1 = require_async();
	const shared_1 = require_shared();
	const encoder = new CborEncoder_1.CborEncoder(shared_1.writer);
	const decoder = new CborDecoder_1.CborDecoder();
	const toBinarySnapshotSync = (options) => {
		const snapshot = (0, sync_1.toSnapshotSync)(options);
		return encoder.encode(snapshot);
	};
	exports.toBinarySnapshotSync = toBinarySnapshotSync;
	const fromBinarySnapshotSync = (uint8, options) => {
		const snapshot = decoder.decode(uint8);
		(0, sync_1.fromSnapshotSync)(snapshot, options);
	};
	exports.fromBinarySnapshotSync = fromBinarySnapshotSync;
	const toBinarySnapshot = async (options) => {
		const snapshot = await (0, async_1.toSnapshot)(options);
		return encoder.encode(snapshot);
	};
	exports.toBinarySnapshot = toBinarySnapshot;
	const fromBinarySnapshot = async (uint8, options) => {
		const snapshot = decoder.decode(uint8);
		await (0, async_1.fromSnapshot)(snapshot, options);
	};
	exports.fromBinarySnapshot = fromBinarySnapshot;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+base64@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/base64/lib/constants.js
var require_constants = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.hasBuffer = exports.alphabet = void 0;
	exports.alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	exports.hasBuffer = typeof Buffer === "function" && typeof Buffer.from === "function";
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+base64@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/base64/lib/createToBase64Bin.js
var require_createToBase64Bin = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.createToBase64Bin = void 0;
	const constants_1 = require_constants();
	const createToBase64Bin = (chars = constants_1.alphabet, pad = "=") => {
		if (chars.length !== 64) throw new Error("chars must be 64 characters long");
		const table = chars.split("").map((c) => c.charCodeAt(0));
		const table2 = [];
		for (const c1 of table) for (const c2 of table) {
			const two = (c1 << 8) + c2;
			table2.push(two);
		}
		const doAddPadding = pad.length === 1;
		const E = doAddPadding ? pad.charCodeAt(0) : 0;
		const EE = doAddPadding ? E << 8 | E : 0;
		return (uint8, start, length, dest, offset) => {
			const extraLength = length % 3;
			const baseLength = length - extraLength;
			for (; start < baseLength; start += 3) {
				const o1 = uint8[start];
				const o2 = uint8[start + 1];
				const o3 = uint8[start + 2];
				const v1 = o1 << 4 | o2 >> 4;
				const v2 = (o2 & 15) << 8 | o3;
				dest.setInt32(offset, (table2[v1] << 16) + table2[v2]);
				offset += 4;
			}
			if (extraLength === 1) {
				const o1 = uint8[baseLength];
				if (doAddPadding) {
					dest.setInt32(offset, (table2[o1 << 4] << 16) + EE);
					offset += 4;
				} else {
					dest.setInt16(offset, table2[o1 << 4]);
					offset += 2;
				}
			} else if (extraLength) {
				const o1 = uint8[baseLength];
				const o2 = uint8[baseLength + 1];
				const v1 = o1 << 4 | o2 >> 4;
				const v2 = (o2 & 15) << 2;
				if (doAddPadding) {
					dest.setInt32(offset, (table2[v1] << 16) + (table[v2] << 8) + E);
					offset += 4;
				} else {
					dest.setInt16(offset, table2[v1]);
					offset += 2;
					dest.setInt8(offset, table[v2]);
					offset += 1;
				}
			}
			return offset;
		};
	};
	exports.createToBase64Bin = createToBase64Bin;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+base64@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/base64/lib/toBase64Bin.js
var require_toBase64Bin = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.toBase64Bin = void 0;
	exports.toBase64Bin = (0, require_createToBase64Bin().createToBase64Bin)();
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+json-pack@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/json-pack/lib/json/JsonEncoder.js
var require_JsonEncoder = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.JsonEncoder = void 0;
	const toBase64Bin_1 = require_toBase64Bin();
	var JsonEncoder = class {
		constructor(writer) {
			this.writer = writer;
		}
		encode(value) {
			const writer = this.writer;
			writer.reset();
			this.writeAny(value);
			return writer.flush();
		}
		writeUnknown(value) {
			this.writeNull();
		}
		writeAny(value) {
			switch (typeof value) {
				case "boolean": return this.writeBoolean(value);
				case "number": return this.writeNumber(value);
				case "string": return this.writeStr(value);
				case "object":
					if (value === null) return this.writeNull();
					switch (value.constructor) {
						case Object: return this.writeObj(value);
						case Array: return this.writeArr(value);
						case Uint8Array: return this.writeBin(value);
						default:
							if (value instanceof Uint8Array) return this.writeBin(value);
							if (Array.isArray(value)) return this.writeArr(value);
							return this.writeUnknown(value);
					}
				case "undefined": return this.writeUndef();
				default: return this.writeUnknown(value);
			}
		}
		writeNull() {
			this.writer.u32(1853189228);
		}
		writeUndef() {
			const writer = this.writer;
			writer.ensureCapacity(35);
			const view = writer.view;
			let x = writer.x;
			view.setUint32(x, 577003892);
			x += 4;
			view.setUint32(x, 1631215984);
			x += 4;
			view.setUint32(x, 1886153059);
			x += 4;
			view.setUint32(x, 1635019119);
			x += 4;
			view.setUint32(x, 1848599394);
			x += 4;
			view.setUint32(x, 1869753442);
			x += 4;
			view.setUint32(x, 1634952502);
			x += 4;
			view.setUint32(x, 876296567);
			x += 4;
			view.setUint16(x, 15677);
			x += 2;
			writer.uint8[x++] = 34;
			writer.x = x;
		}
		writeBoolean(bool) {
			if (bool) this.writer.u32(1953658213);
			else this.writer.u8u32(102, 1634497381);
		}
		writeNumber(num) {
			const str = num.toString();
			this.writer.ascii(str);
		}
		writeInteger(int) {
			this.writeNumber(int >> 0 === int ? int : Math.trunc(int));
		}
		writeUInteger(uint) {
			this.writeInteger(uint < 0 ? -uint : uint);
		}
		writeFloat(float) {
			this.writeNumber(float);
		}
		writeBin(buf) {
			const writer = this.writer;
			const length = buf.length;
			writer.ensureCapacity(41 + (length << 1));
			const view = writer.view;
			let x = writer.x;
			view.setUint32(x, 577003892);
			x += 4;
			view.setUint32(x, 1631215984);
			x += 4;
			view.setUint32(x, 1886153059);
			x += 4;
			view.setUint32(x, 1635019119);
			x += 4;
			view.setUint32(x, 1848602467);
			x += 4;
			view.setUint32(x, 1952805933);
			x += 4;
			view.setUint32(x, 1937011301);
			x += 4;
			view.setUint32(x, 1634548578);
			x += 4;
			view.setUint32(x, 1634952502);
			x += 4;
			view.setUint16(x, 13356);
			x += 2;
			x = (0, toBase64Bin_1.toBase64Bin)(buf, 0, length, view, x);
			writer.uint8[x++] = 34;
			writer.x = x;
		}
		writeStr(str) {
			const writer = this.writer;
			const length = str.length;
			writer.ensureCapacity(length * 4 + 2);
			if (length < 256) {
				const startX = writer.x;
				let x = startX;
				const uint8 = writer.uint8;
				uint8[x++] = 34;
				for (let i = 0; i < length; i++) {
					const code = str.charCodeAt(i);
					switch (code) {
						case 34:
						case 92: uint8[x++] = 92;
					}
					if (code < 32 || code > 126) {
						writer.x = startX;
						const jsonStr = JSON.stringify(str);
						writer.ensureCapacity(jsonStr.length * 4 + 4);
						writer.utf8(jsonStr);
						return;
					} else uint8[x++] = code;
				}
				uint8[x++] = 34;
				writer.x = x;
				return;
			}
			const jsonStr = JSON.stringify(str);
			writer.ensureCapacity(jsonStr.length * 4 + 4);
			writer.utf8(jsonStr);
		}
		writeAsciiStr(str) {
			const length = str.length;
			const writer = this.writer;
			writer.ensureCapacity(length * 2 + 2);
			const uint8 = writer.uint8;
			let x = writer.x;
			uint8[x++] = 34;
			for (let i = 0; i < length; i++) {
				const code = str.charCodeAt(i);
				switch (code) {
					case 34:
					case 92: uint8[x++] = 92;
				}
				uint8[x++] = code;
			}
			uint8[x++] = 34;
			writer.x = x;
		}
		writeArr(arr) {
			const writer = this.writer;
			writer.u8(91);
			const last = arr.length - 1;
			for (let i = 0; i < last; i++) {
				this.writeAny(arr[i]);
				writer.u8(44);
			}
			if (last >= 0) this.writeAny(arr[last]);
			writer.u8(93);
		}
		writeArrSeparator() {
			this.writer.u8(44);
		}
		writeObj(obj) {
			const writer = this.writer;
			const keys = Object.keys(obj);
			const length = keys.length;
			if (!length) return writer.u16(31613);
			writer.u8(123);
			for (let i = 0; i < length; i++) {
				const key = keys[i];
				const value = obj[key];
				this.writeStr(key);
				writer.u8(58);
				this.writeAny(value);
				writer.u8(44);
			}
			writer.uint8[writer.x - 1] = 125;
		}
		writeObjSeparator() {
			this.writer.u8(44);
		}
		writeObjKeySeparator() {
			this.writer.u8(58);
		}
		writeStartStr() {
			throw new Error("Method not implemented.");
		}
		writeStrChunk(str) {
			throw new Error("Method not implemented.");
		}
		writeEndStr() {
			throw new Error("Method not implemented.");
		}
		writeStartBin() {
			throw new Error("Method not implemented.");
		}
		writeBinChunk(buf) {
			throw new Error("Method not implemented.");
		}
		writeEndBin() {
			throw new Error("Method not implemented.");
		}
		writeStartArr() {
			this.writer.u8(91);
		}
		writeArrChunk(item) {
			throw new Error("Method not implemented.");
		}
		writeEndArr() {
			this.writer.u8(93);
		}
		writeStartObj() {
			this.writer.u8(123);
		}
		writeObjChunk(key, value) {
			throw new Error("Method not implemented.");
		}
		writeEndObj() {
			this.writer.u8(125);
		}
	};
	exports.JsonEncoder = JsonEncoder;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+base64@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/base64/lib/createFromBase64Bin.js
var require_createFromBase64Bin = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.createFromBase64Bin = void 0;
	const constants_1 = require_constants();
	const createFromBase64Bin = (chars = constants_1.alphabet, pad = "=") => {
		if (chars.length !== 64) throw new Error("chars must be 64 characters long");
		let max = 0;
		for (let i = 0; i < chars.length; i++) max = Math.max(max, chars.charCodeAt(i));
		const table = [];
		for (let i = 0; i <= max; i += 1) table[i] = -1;
		for (let i = 0; i < chars.length; i++) table[chars.charCodeAt(i)] = i;
		const PAD = pad.length === 1 ? pad.charCodeAt(0) : 0;
		return (view, offset, length) => {
			if (!length) return /* @__PURE__ */ new Uint8Array(0);
			let padding = 0;
			if (length % 4 !== 0) {
				padding = 4 - length % 4;
				length += padding;
			} else {
				const last = offset + length - 1;
				if (view.getUint8(last) === PAD) {
					padding = 1;
					if (length > 1 && view.getUint8(last - 1) === PAD) padding = 2;
				}
			}
			if (length % 4 !== 0) throw new Error("Base64 string length must be a multiple of 4");
			const mainEnd = offset + length - (padding ? 4 : 0);
			const bufferLength = (length >> 2) * 3 - padding;
			const buf = new Uint8Array(bufferLength);
			let j = 0;
			let i = offset;
			for (; i < mainEnd; i += 4) {
				const word = view.getUint32(i);
				const octet0 = word >>> 24;
				const octet1 = word >>> 16 & 255;
				const octet2 = word >>> 8 & 255;
				const octet3 = word & 255;
				const sextet0 = table[octet0];
				const sextet1 = table[octet1];
				const sextet2 = table[octet2];
				const sextet3 = table[octet3];
				if (sextet0 < 0 || sextet1 < 0 || sextet2 < 0 || sextet3 < 0) throw new Error("INVALID_BASE64_SEQ");
				buf[j] = sextet0 << 2 | sextet1 >> 4;
				buf[j + 1] = sextet1 << 4 | sextet2 >> 2;
				buf[j + 2] = sextet2 << 6 | sextet3;
				j += 3;
			}
			if (!padding) return buf;
			if (padding === 1) {
				const word = view.getUint16(mainEnd);
				const octet0 = word >> 8;
				const octet1 = word & 255;
				const octet2 = view.getUint8(mainEnd + 2);
				const sextet0 = table[octet0];
				const sextet1 = table[octet1];
				const sextet2 = table[octet2];
				if (sextet0 < 0 || sextet1 < 0 || sextet2 < 0) throw new Error("INVALID_BASE64_SEQ");
				buf[j] = sextet0 << 2 | sextet1 >> 4;
				buf[j + 1] = sextet1 << 4 | sextet2 >> 2;
				return buf;
			}
			const word = view.getUint16(mainEnd);
			const octet0 = word >> 8;
			const octet1 = word & 255;
			const sextet0 = table[octet0];
			const sextet1 = table[octet1];
			if (sextet0 < 0 || sextet1 < 0) throw new Error("INVALID_BASE64_SEQ");
			buf[j] = sextet0 << 2 | sextet1 >> 4;
			return buf;
		};
	};
	exports.createFromBase64Bin = createFromBase64Bin;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+base64@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/base64/lib/fromBase64Bin.js
var require_fromBase64Bin = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.fromBase64Bin = void 0;
	exports.fromBase64Bin = (0, require_createFromBase64Bin().createFromBase64Bin)();
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+json-pack@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/json-pack/lib/json/util.js
var require_util = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.findEndingQuote = void 0;
	const findEndingQuote = (uint8, x) => {
		const len = uint8.length;
		let char = uint8[x];
		let prev = 0;
		while (x < len) {
			if (char === 34 && prev !== 92) break;
			if (char === 92 && prev === 92) prev = 0;
			else prev = char;
			char = uint8[++x];
		}
		if (x === len) throw new Error("Invalid JSON");
		return x;
	};
	exports.findEndingQuote = findEndingQuote;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+json-pack@17.67.0_tslib@2.8.1/node_modules/@jsonjoy.com/json-pack/lib/json/JsonDecoder.js
var require_JsonDecoder = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.JsonDecoder = exports.readKey = void 0;
	const decodeUtf8_1 = require_decodeUtf8();
	const Reader_1 = require_Reader();
	const fromBase64Bin_1 = require_fromBase64Bin();
	const util_1 = require_util();
	const REGEX_REPLACE_ESCAPED_CHARS = /\\(b|f|n|r|t|"|\/|\\)/g;
	const escapedCharReplacer = (char) => {
		switch (char) {
			case "\\b": return "\b";
			case "\\f": return "\f";
			case "\\n": return "\n";
			case "\\r": return "\r";
			case "\\t": return "	";
			case "\\\"": return "\"";
			case "\\/": return "/";
			case "\\\\": return "\\";
		}
		return char;
	};
	const hasBinaryPrefix = (u8, x) => u8[x] === 100 && u8[x + 1] === 97 && u8[x + 2] === 116 && u8[x + 3] === 97 && u8[x + 4] === 58 && u8[x + 5] === 97 && u8[x + 6] === 112 && u8[x + 7] === 112 && u8[x + 8] === 108 && u8[x + 9] === 105 && u8[x + 10] === 99 && u8[x + 11] === 97 && u8[x + 12] === 116 && u8[x + 13] === 105 && u8[x + 14] === 111 && u8[x + 15] === 110 && u8[x + 16] === 47 && u8[x + 17] === 111 && u8[x + 18] === 99 && u8[x + 19] === 116 && u8[x + 20] === 101 && u8[x + 21] === 116 && u8[x + 22] === 45 && u8[x + 23] === 115 && u8[x + 24] === 116 && u8[x + 25] === 114 && u8[x + 26] === 101 && u8[x + 27] === 97 && u8[x + 28] === 109 && u8[x + 29] === 59 && u8[x + 30] === 98 && u8[x + 31] === 97 && u8[x + 32] === 115 && u8[x + 33] === 101 && u8[x + 34] === 54 && u8[x + 35] === 52 && u8[x + 36] === 44;
	const isUndefined = (u8, x) => u8[x++] === 97 && u8[x++] === 116 && u8[x++] === 97 && u8[x++] === 58 && u8[x++] === 97 && u8[x++] === 112 && u8[x++] === 112 && u8[x++] === 108 && u8[x++] === 105 && u8[x++] === 99 && u8[x++] === 97 && u8[x++] === 116 && u8[x++] === 105 && u8[x++] === 111 && u8[x++] === 110 && u8[x++] === 47 && u8[x++] === 99 && u8[x++] === 98 && u8[x++] === 111 && u8[x++] === 114 && u8[x++] === 44 && u8[x++] === 98 && u8[x++] === 97 && u8[x++] === 115 && u8[x++] === 101 && u8[x++] === 54 && u8[x++] === 52 && u8[x++] === 59 && u8[x++] === 57 && u8[x++] === 119 && u8[x++] === 61 && u8[x++] === 61 && u8[x++] === 34;
	const fromCharCode = String.fromCharCode;
	const readKey = (reader) => {
		const buf = reader.uint8;
		const len = buf.length;
		const points = [];
		let x = reader.x;
		let prev = 0;
		while (x < len) {
			let code = buf[x++];
			if ((code & 128) === 0) {
				if (prev === 92) {
					switch (code) {
						case 98:
							code = 8;
							break;
						case 102:
							code = 12;
							break;
						case 110:
							code = 10;
							break;
						case 114:
							code = 13;
							break;
						case 116:
							code = 9;
							break;
						case 34:
							code = 34;
							break;
						case 47:
							code = 47;
							break;
						case 92:
							code = 92;
							break;
						default: throw new Error("Invalid JSON");
					}
					prev = 0;
				} else {
					if (code === 34) break;
					prev = code;
					if (prev === 92) continue;
				}
			} else {
				const octet2 = buf[x++] & 63;
				if ((code & 224) === 192) code = (code & 31) << 6 | octet2;
				else {
					const octet3 = buf[x++] & 63;
					if ((code & 240) === 224) code = (code & 31) << 12 | octet2 << 6 | octet3;
					else if ((code & 248) === 240) {
						const octet4 = buf[x++] & 63;
						let unit = (code & 7) << 18 | octet2 << 12 | octet3 << 6 | octet4;
						if (unit > 65535) {
							unit -= 65536;
							const unit0 = unit >>> 10 & 1023 | 55296;
							unit = 56320 | unit & 1023;
							points.push(unit0);
							code = unit;
						} else code = unit;
					}
				}
			}
			points.push(code);
		}
		reader.x = x;
		return fromCharCode.apply(String, points);
	};
	exports.readKey = readKey;
	var JsonDecoder = class {
		constructor() {
			this.reader = new Reader_1.Reader();
		}
		read(uint8) {
			this.reader.reset(uint8);
			return this.readAny();
		}
		decode(uint8) {
			this.reader.reset(uint8);
			return this.readAny();
		}
		readAny() {
			this.skipWhitespace();
			const reader = this.reader;
			const x = reader.x;
			const uint8 = reader.uint8;
			const char = uint8[x];
			switch (char) {
				case 34:
					if (uint8[x + 1] === 100) {
						const bin = this.tryReadBin();
						if (bin) return bin;
						if (isUndefined(uint8, x + 2)) {
							reader.x = x + 35;
							return;
						}
					}
					return this.readStr();
				case 91: return this.readArr();
				case 102: return this.readFalse();
				case 110: return this.readNull();
				case 116: return this.readTrue();
				case 123: return this.readObj();
				default:
					if (char >= 48 && char <= 57 || char === 45) return this.readNum();
					throw new Error("Invalid JSON");
			}
		}
		skipWhitespace() {
			const reader = this.reader;
			const uint8 = reader.uint8;
			let x = reader.x;
			let char = 0;
			while (true) {
				char = uint8[x];
				switch (char) {
					case 32:
					case 9:
					case 10:
					case 13:
						x++;
						continue;
					default:
						reader.x = x;
						return;
				}
			}
		}
		readNull() {
			if (this.reader.u32() !== 1853189228) throw new Error("Invalid JSON");
			return null;
		}
		readTrue() {
			if (this.reader.u32() !== 1953658213) throw new Error("Invalid JSON");
			return true;
		}
		readFalse() {
			const reader = this.reader;
			if (reader.u8() !== 102 || reader.u32() !== 1634497381) throw new Error("Invalid JSON");
			return false;
		}
		readBool() {
			const reader = this.reader;
			switch (reader.uint8[reader.x]) {
				case 102: return this.readFalse();
				case 116: return this.readTrue();
				default: throw new Error("Invalid JSON");
			}
		}
		readNum() {
			const reader = this.reader;
			const uint8 = reader.uint8;
			let x = reader.x;
			let c = uint8[x++];
			const c1 = c;
			c = uint8[x++];
			if (!c || (c < 45 || c > 57) && c !== 43 && c !== 69 && c !== 101) {
				reader.x = x - 1;
				const num = +fromCharCode(c1);
				if (num !== num) throw new Error("Invalid JSON");
				return num;
			}
			const c2 = c;
			c = uint8[x++];
			if (!c || (c < 45 || c > 57) && c !== 43 && c !== 69 && c !== 101) {
				reader.x = x - 1;
				const num = +fromCharCode(c1, c2);
				if (num !== num) throw new Error("Invalid JSON");
				return num;
			}
			const c3 = c;
			c = uint8[x++];
			if (!c || (c < 45 || c > 57) && c !== 43 && c !== 69 && c !== 101) {
				reader.x = x - 1;
				const num = +fromCharCode(c1, c2, c3);
				if (num !== num) throw new Error("Invalid JSON");
				return num;
			}
			const c4 = c;
			c = uint8[x++];
			if (!c || (c < 45 || c > 57) && c !== 43 && c !== 69 && c !== 101) {
				reader.x = x - 1;
				const num = +fromCharCode(c1, c2, c3, c4);
				if (num !== num) throw new Error("Invalid JSON");
				return num;
			}
			const c5 = c;
			c = uint8[x++];
			if (!c || (c < 45 || c > 57) && c !== 43 && c !== 69 && c !== 101) {
				reader.x = x - 1;
				const num = +fromCharCode(c1, c2, c3, c4, c5);
				if (num !== num) throw new Error("Invalid JSON");
				return num;
			}
			const c6 = c;
			c = uint8[x++];
			if (!c || (c < 45 || c > 57) && c !== 43 && c !== 69 && c !== 101) {
				reader.x = x - 1;
				const num = +fromCharCode(c1, c2, c3, c4, c5, c6);
				if (num !== num) throw new Error("Invalid JSON");
				return num;
			}
			const c7 = c;
			c = uint8[x++];
			if (!c || (c < 45 || c > 57) && c !== 43 && c !== 69 && c !== 101) {
				reader.x = x - 1;
				const num = +fromCharCode(c1, c2, c3, c4, c5, c6, c7);
				if (num !== num) throw new Error("Invalid JSON");
				return num;
			}
			const c8 = c;
			c = uint8[x++];
			if (!c || (c < 45 || c > 57) && c !== 43 && c !== 69 && c !== 101) {
				reader.x = x - 1;
				const num = +fromCharCode(c1, c2, c3, c4, c5, c6, c7, c8);
				if (num !== num) throw new Error("Invalid JSON");
				return num;
			}
			const c9 = c;
			c = uint8[x++];
			if (!c || (c < 45 || c > 57) && c !== 43 && c !== 69 && c !== 101) {
				reader.x = x - 1;
				const num = +fromCharCode(c1, c2, c3, c4, c5, c6, c7, c8, c9);
				if (num !== num) throw new Error("Invalid JSON");
				return num;
			}
			const c10 = c;
			c = uint8[x++];
			if (!c || (c < 45 || c > 57) && c !== 43 && c !== 69 && c !== 101) {
				reader.x = x - 1;
				const num = +fromCharCode(c1, c2, c3, c4, c5, c6, c7, c8, c9, c10);
				if (num !== num) throw new Error("Invalid JSON");
				return num;
			}
			const c11 = c;
			c = uint8[x++];
			if (!c || (c < 45 || c > 57) && c !== 43 && c !== 69 && c !== 101) {
				reader.x = x - 1;
				const num = +fromCharCode(c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11);
				if (num !== num) throw new Error("Invalid JSON");
				return num;
			}
			const c12 = c;
			c = uint8[x++];
			if (!c || (c < 45 || c > 57) && c !== 43 && c !== 69 && c !== 101) {
				reader.x = x - 1;
				const num = +fromCharCode(c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12);
				if (num !== num) throw new Error("Invalid JSON");
				return num;
			}
			const c13 = c;
			c = uint8[x++];
			if (!c || (c < 45 || c > 57) && c !== 43 && c !== 69 && c !== 101) {
				reader.x = x - 1;
				const num = +fromCharCode(c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13);
				if (num !== num) throw new Error("Invalid JSON");
				return num;
			}
			const c14 = c;
			c = uint8[x++];
			if (!c || (c < 45 || c > 57) && c !== 43 && c !== 69 && c !== 101) {
				reader.x = x - 1;
				const num = +fromCharCode(c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14);
				if (num !== num) throw new Error("Invalid JSON");
				return num;
			}
			const c15 = c;
			c = uint8[x++];
			if (!c || (c < 45 || c > 57) && c !== 43 && c !== 69 && c !== 101) {
				reader.x = x - 1;
				const num = +fromCharCode(c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14, c15);
				if (num !== num) throw new Error("Invalid JSON");
				return num;
			}
			const c16 = c;
			c = uint8[x++];
			if (!c || (c < 45 || c > 57) && c !== 43 && c !== 69 && c !== 101) {
				reader.x = x - 1;
				const num = +fromCharCode(c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14, c15, c16);
				if (num !== num) throw new Error("Invalid JSON");
				return num;
			}
			const c17 = c;
			c = uint8[x++];
			if (!c || (c < 45 || c > 57) && c !== 43 && c !== 69 && c !== 101) {
				reader.x = x - 1;
				const num = +fromCharCode(c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14, c15, c16, c17);
				if (num !== num) throw new Error("Invalid JSON");
				return num;
			}
			const c18 = c;
			c = uint8[x++];
			if (!c || (c < 45 || c > 57) && c !== 43 && c !== 69 && c !== 101) {
				reader.x = x - 1;
				const num = +fromCharCode(c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14, c15, c16, c17, c18);
				if (num !== num) throw new Error("Invalid JSON");
				return num;
			}
			const c19 = c;
			c = uint8[x++];
			if (!c || (c < 45 || c > 57) && c !== 43 && c !== 69 && c !== 101) {
				reader.x = x - 1;
				const num = +fromCharCode(c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14, c15, c16, c17, c18, c19);
				if (num !== num) throw new Error("Invalid JSON");
				return num;
			}
			const c20 = c;
			c = uint8[x++];
			if (!c || (c < 45 || c > 57) && c !== 43 && c !== 69 && c !== 101) {
				reader.x = x - 1;
				const num = +fromCharCode(c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14, c15, c16, c17, c18, c19, c20);
				if (num !== num) throw new Error("Invalid JSON");
				return num;
			}
			const c21 = c;
			c = uint8[x++];
			if (!c || (c < 45 || c > 57) && c !== 43 && c !== 69 && c !== 101) {
				reader.x = x - 1;
				const num = +fromCharCode(c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14, c15, c16, c17, c18, c19, c20, c21);
				if (num !== num) throw new Error("Invalid JSON");
				return num;
			}
			const c22 = c;
			c = uint8[x++];
			if (!c || (c < 45 || c > 57) && c !== 43 && c !== 69 && c !== 101) {
				reader.x = x - 1;
				const num = +fromCharCode(c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14, c15, c16, c17, c18, c19, c20, c21, c22);
				if (num !== num) throw new Error("Invalid JSON");
				return num;
			}
			const c23 = c;
			c = uint8[x++];
			if (!c || (c < 45 || c > 57) && c !== 43 && c !== 69 && c !== 101) {
				reader.x = x - 1;
				const num = +fromCharCode(c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14, c15, c16, c17, c18, c19, c20, c21, c22, c23);
				if (num !== num) throw new Error("Invalid JSON");
				return num;
			}
			const c24 = c;
			c = uint8[x++];
			if (!c || (c < 45 || c > 57) && c !== 43 && c !== 69 && c !== 101) {
				reader.x = x - 1;
				const num = +fromCharCode(c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14, c15, c16, c17, c18, c19, c20, c21, c22, c23, c24);
				if (num !== num) throw new Error("Invalid JSON");
				return num;
			}
			throw new Error("Invalid JSON");
		}
		readStr() {
			const reader = this.reader;
			const uint8 = reader.uint8;
			if (uint8[reader.x++] !== 34) throw new Error("Invalid JSON");
			const x0 = reader.x;
			const x1 = (0, util_1.findEndingQuote)(uint8, x0);
			let str = (0, decodeUtf8_1.decodeUtf8)(uint8, x0, x1 - x0);
			str = str.replace(REGEX_REPLACE_ESCAPED_CHARS, escapedCharReplacer);
			reader.x = x1 + 1;
			return str;
		}
		tryReadBin() {
			const reader = this.reader;
			const u8 = reader.uint8;
			let x = reader.x;
			if (u8[x++] !== 34) return void 0;
			if (!hasBinaryPrefix(u8, x)) return void 0;
			x += 37;
			const x0 = x;
			x = (0, util_1.findEndingQuote)(u8, x);
			reader.x = x0;
			const bin = (0, fromBase64Bin_1.fromBase64Bin)(reader.view, x0, x - x0);
			reader.x = x + 1;
			return bin;
		}
		readBin() {
			const reader = this.reader;
			const u8 = reader.uint8;
			let x = reader.x;
			if (u8[x++] !== 34) throw new Error("Invalid JSON");
			if (!hasBinaryPrefix(u8, x)) throw new Error("Invalid JSON");
			x += 37;
			const x0 = x;
			x = (0, util_1.findEndingQuote)(u8, x);
			reader.x = x0;
			const bin = (0, fromBase64Bin_1.fromBase64Bin)(reader.view, x0, x - x0);
			reader.x = x + 1;
			return bin;
		}
		readArr() {
			const reader = this.reader;
			if (reader.u8() !== 91) throw new Error("Invalid JSON");
			const arr = [];
			const uint8 = reader.uint8;
			let first = true;
			while (true) {
				this.skipWhitespace();
				const char = uint8[reader.x];
				if (char === 93) return reader.x++, arr;
				if (char === 44) reader.x++;
				else if (!first) throw new Error("Invalid JSON");
				this.skipWhitespace();
				arr.push(this.readAny());
				first = false;
			}
		}
		readObj() {
			const reader = this.reader;
			if (reader.u8() !== 123) throw new Error("Invalid JSON");
			const obj = {};
			const uint8 = reader.uint8;
			let first = true;
			while (true) {
				this.skipWhitespace();
				let char = uint8[reader.x];
				if (char === 125) return reader.x++, obj;
				if (char === 44) reader.x++;
				else if (!first) throw new Error("Invalid JSON");
				this.skipWhitespace();
				char = uint8[reader.x++];
				if (char !== 34) throw new Error("Invalid JSON");
				const key = (0, exports.readKey)(reader);
				if (key === "__proto__") throw new Error("Invalid JSON");
				this.skipWhitespace();
				if (reader.u8() !== 58) throw new Error("Invalid JSON");
				this.skipWhitespace();
				obj[key] = this.readAny();
				first = false;
			}
		}
	};
	exports.JsonDecoder = JsonDecoder;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-snapshot@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-snapshot/lib/json.js
var require_json = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.fromJsonSnapshot = exports.toJsonSnapshot = exports.fromJsonSnapshotSync = exports.toJsonSnapshotSync = void 0;
	const JsonEncoder_1 = require_JsonEncoder();
	const JsonDecoder_1 = require_JsonDecoder();
	const sync_1 = require_sync();
	const async_1 = require_async();
	const shared_1 = require_shared();
	const encoder = new JsonEncoder_1.JsonEncoder(shared_1.writer);
	const decoder = new JsonDecoder_1.JsonDecoder();
	const toJsonSnapshotSync = (options) => {
		const snapshot = (0, sync_1.toSnapshotSync)(options);
		return encoder.encode(snapshot);
	};
	exports.toJsonSnapshotSync = toJsonSnapshotSync;
	const fromJsonSnapshotSync = (uint8, options) => {
		const snapshot = decoder.read(uint8);
		(0, sync_1.fromSnapshotSync)(snapshot, options);
	};
	exports.fromJsonSnapshotSync = fromJsonSnapshotSync;
	const toJsonSnapshot = async (options) => {
		const snapshot = await (0, async_1.toSnapshot)(options);
		return encoder.encode(snapshot);
	};
	exports.toJsonSnapshot = toJsonSnapshot;
	const fromJsonSnapshot = async (uint8, options) => {
		const snapshot = decoder.read(uint8);
		await (0, async_1.fromSnapshot)(snapshot, options);
	};
	exports.fromJsonSnapshot = fromJsonSnapshot;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-snapshot@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-snapshot/lib/index.js
var require_lib$2 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
	tslib_1.__exportStar(require_constants$1(), exports);
	tslib_1.__exportStar(require_sync(), exports);
	tslib_1.__exportStar(require_binary(), exports);
	tslib_1.__exportStar(require_json(), exports);
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node/lib/options.js
var require_options = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.getWriteFileOptions = exports.writeFileDefaults = exports.getRealpathOptsAndCb = exports.getRealpathOptions = exports.getStatfsOptsAndCb = exports.getStatfsOptions = exports.getStatOptsAndCb = exports.getStatOptions = exports.getAppendFileOptsAndCb = exports.getAppendFileOpts = exports.getOpendirOptsAndCb = exports.getOpendirOptions = exports.getReaddirOptsAndCb = exports.getReaddirOptions = exports.getReadFileOptions = exports.getRmOptsAndCb = exports.getRmdirOptions = exports.getDefaultOptsAndCb = exports.getDefaultOpts = exports.optsDefaults = exports.getMkdirOptions = void 0;
	exports.getOptions = getOptions;
	exports.optsGenerator = optsGenerator;
	exports.optsAndCbGenerator = optsAndCbGenerator;
	const fs_node_utils_1 = require_lib$6();
	const util_1 = require_util$2();
	const mkdirDefaults = {
		mode: 511,
		recursive: false
	};
	const getMkdirOptions = (options) => {
		if (typeof options === "number") return Object.assign({}, mkdirDefaults, { mode: options });
		return Object.assign({}, mkdirDefaults, options);
	};
	exports.getMkdirOptions = getMkdirOptions;
	const ERRSTR_OPTS = (tipeof) => `Expected options to be either an object or a string, but got ${tipeof} instead`;
	function getOptions(defaults, options) {
		let opts;
		if (!options) return defaults;
		else {
			const tipeof = typeof options;
			switch (tipeof) {
				case "string":
					opts = Object.assign({}, defaults, { encoding: options });
					break;
				case "object":
					opts = Object.assign({}, defaults, options);
					break;
				default: throw TypeError(ERRSTR_OPTS(tipeof));
			}
		}
		if (opts.encoding !== "buffer") (0, fs_node_utils_1.assertEncoding)(opts.encoding);
		return opts;
	}
	function optsGenerator(defaults) {
		return (options) => getOptions(defaults, options);
	}
	function optsAndCbGenerator(getOpts) {
		return (options, callback) => typeof options === "function" ? [getOpts(), options] : [getOpts(options), (0, util_1.validateCallback)(callback)];
	}
	exports.optsDefaults = { encoding: "utf8" };
	exports.getDefaultOpts = optsGenerator(exports.optsDefaults);
	exports.getDefaultOptsAndCb = optsAndCbGenerator(exports.getDefaultOpts);
	const rmdirDefaults = { recursive: false };
	const getRmdirOptions = (options) => {
		return Object.assign({}, rmdirDefaults, options);
	};
	exports.getRmdirOptions = getRmdirOptions;
	exports.getRmOptsAndCb = optsAndCbGenerator(optsGenerator(exports.optsDefaults));
	exports.getReadFileOptions = optsGenerator({ flag: "r" });
	exports.getReaddirOptions = optsGenerator({
		encoding: "utf8",
		recursive: false,
		withFileTypes: false
	});
	exports.getReaddirOptsAndCb = optsAndCbGenerator(exports.getReaddirOptions);
	exports.getOpendirOptions = optsGenerator({
		encoding: "utf8",
		bufferSize: 32,
		recursive: false
	});
	exports.getOpendirOptsAndCb = optsAndCbGenerator(exports.getOpendirOptions);
	exports.getAppendFileOpts = optsGenerator({
		encoding: "utf8",
		mode: 438,
		flag: fs_node_utils_1.FLAGS[fs_node_utils_1.FLAGS.a]
	});
	exports.getAppendFileOptsAndCb = optsAndCbGenerator(exports.getAppendFileOpts);
	const statDefaults = { bigint: false };
	const getStatOptions = (options = {}) => Object.assign({}, statDefaults, options);
	exports.getStatOptions = getStatOptions;
	const getStatOptsAndCb = (options, callback) => typeof options === "function" ? [(0, exports.getStatOptions)(), options] : [(0, exports.getStatOptions)(options), (0, util_1.validateCallback)(callback)];
	exports.getStatOptsAndCb = getStatOptsAndCb;
	const statfsDefaults = { bigint: false };
	const getStatfsOptions = (options = {}) => Object.assign({}, statfsDefaults, options);
	exports.getStatfsOptions = getStatfsOptions;
	const getStatfsOptsAndCb = (options, callback) => typeof options === "function" ? [(0, exports.getStatfsOptions)(), options] : [(0, exports.getStatfsOptions)(options), (0, util_1.validateCallback)(callback)];
	exports.getStatfsOptsAndCb = getStatfsOptsAndCb;
	const realpathDefaults = exports.optsDefaults;
	exports.getRealpathOptions = optsGenerator(realpathDefaults);
	exports.getRealpathOptsAndCb = optsAndCbGenerator(exports.getRealpathOptions);
	exports.writeFileDefaults = {
		encoding: "utf8",
		mode: 438,
		flag: fs_node_utils_1.FLAGS[fs_node_utils_1.FLAGS.w]
	};
	exports.getWriteFileOptions = optsGenerator(exports.writeFileDefaults);
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node/lib/Dir.js
var require_Dir = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Dir = void 0;
	const fs_node_utils_1 = require_lib$6();
	const argErrors_1 = require_argErrors();
	const validators_1 = require_validators();
	const Dirent_1 = require_Dirent();
	const util_1 = require_util$2();
	const DEFAULT_ENCODING = { encoding: "utf8" };
	const dirClosed = () => (0, argErrors_1.withCode)(/* @__PURE__ */ new Error("Directory handle was closed"), "ERR_DIR_CLOSED");
	const dirBusy = () => (0, argErrors_1.withCode)(/* @__PURE__ */ new Error("Cannot do synchronous work on directory handle with concurrent asynchronous operations"), "ERR_DIR_CONCURRENT_OPERATION");
	var Dir = class Dir {
		constructor(handle, path, options) {
			this.levels = [];
			this.closed = false;
			this.operationQueue = null;
			if (handle === null || handle === void 0) throw (0, argErrors_1.withCode)(/* @__PURE__ */ new TypeError("The \"handle\" argument must be specified"), "ERR_MISSING_ARGS");
			const type = typeof options;
			const opts = {
				bufferSize: 32,
				...options === null || options === void 0 || type === "function" ? DEFAULT_ENCODING : type === "string" ? { encoding: options } : options
			};
			(0, validators_1.validateUint32)(opts.bufferSize, "options.bufferSize", true);
			this.options = opts;
			this._path = path;
			const parentPath = typeof path === "string" ? path : path.toString();
			this.levels.push({
				entries: handle.children[Symbol.iterator](),
				path,
				parentPath
			});
		}
		readBase() {
			const levels = this.levels;
			const options = this.options;
			const encoding = options.encoding;
			const recursive = options.recursive;
			while (levels.length) {
				const level = levels[levels.length - 1];
				const { done, value } = level.entries.next();
				if (done) {
					levels.pop();
					continue;
				}
				const name = value[0];
				if (name === "." || name === "..") continue;
				const link = value[1];
				const dirent = Dirent_1.default.build(link, encoding, level.parentPath);
				if (recursive && dirent.isDirectory()) this.descend(level.path, dirent.name, link);
				return dirent;
			}
			return null;
		}
		descend(parent, name, link) {
			const path = (0, fs_node_utils_1.pathJoin)(parent, name);
			if (!link.getNode().canRead()) throw (0, util_1.createError)("EACCES", "opendir", path);
			this.levels.push({
				entries: link.children[Symbol.iterator](),
				path,
				parentPath: path
			});
		}
		readPromise() {
			return new Promise((resolve, reject) => {
				this.readImpl((err, entry) => {
					if (err) reject(err);
					else resolve(entry ?? null);
				});
			});
		}
		readImpl(callback) {
			if (this.closed) throw dirClosed();
			if (callback === void 0) return this.readPromise();
			const cb = callback;
			(0, util_1.validateCallback)(cb);
			const queued = this.operationQueue;
			if (queued !== null) {
				queued.push(() => {
					try {
						this.readImpl(cb);
					} catch (err) {
						process.nextTick(cb, err);
					}
				});
				return;
			}
			this.operationQueue = [];
			let entry = null;
			let error = null;
			try {
				entry = this.readBase();
			} catch (err) {
				error = err;
			}
			process.nextTick(() => {
				process.nextTick(() => {
					const queue = this.operationQueue;
					this.operationQueue = null;
					if (queue) for (let i = 0; i < queue.length; i++) queue[i]();
				});
				if (error) cb(error);
				else cb(null, entry);
			});
		}
		get path() {
			if (!(this instanceof Dir)) throw (0, argErrors_1.invalidThis)("Dir");
			return this._path;
		}
		close(callback) {
			if (callback === void 0) {
				if (this.closed) return Promise.reject(dirClosed());
				return new Promise((resolve, reject) => {
					this.close((err) => {
						if (err) reject(err);
						else resolve();
					});
				});
			}
			const cb = callback;
			(0, util_1.validateCallback)(cb);
			if (this.closed) {
				process.nextTick(cb, dirClosed());
				return;
			}
			const queued = this.operationQueue;
			if (queued !== null) {
				queued.push(() => {
					this.close(cb);
				});
				return;
			}
			this.closed = true;
			process.nextTick(cb, null);
		}
		closeSync() {
			if (this.closed) throw dirClosed();
			if (this.operationQueue !== null) throw dirBusy();
			this.closed = true;
		}
		read(callback) {
			if (arguments.length === 0) return this.readPromise();
			return this.readImpl(callback);
		}
		readSync() {
			if (this.closed) throw dirClosed();
			if (this.operationQueue !== null) throw dirBusy();
			return this.readBase();
		}
		async *entries() {
			try {
				while (true) {
					const entry = await this.read();
					if (entry === null) break;
					yield entry;
				}
			} finally {
				await this.close();
			}
		}
		async [Symbol.asyncDispose]() {
			if (this.closed) return;
			await this.close();
		}
		[Symbol.dispose]() {
			if (this.closed) return;
			this.closeSync();
		}
	};
	exports.Dir = Dir;
	Object.defineProperty(Dir.prototype, Symbol.asyncIterator, {
		enumerable: false,
		writable: true,
		configurable: true,
		value: Dir.prototype.entries
	});
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node/lib/volume.js
var require_volume = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.FSWatcher = exports.StatWatcher = exports.Volume = void 0;
	exports.pathToSteps = pathToSteps;
	exports.dataToStr = dataToStr;
	exports.toUnixTimestamp = toUnixTimestamp;
	const path_1 = require_path$1();
	const fs_core_1 = require_lib$5();
	const Stats_1 = require_Stats();
	const Dirent_1 = require_Dirent();
	const StatFs_1 = require_StatFs();
	const glob_1 = require_glob();
	const buffer_1 = require_buffer();
	const setTimeoutUnref_1 = require_setTimeoutUnref();
	const stream_1 = require_stream();
	const fs_node_utils_1 = require_lib$6();
	const events_1 = require_events();
	const FileHandle_1 = require_FileHandle();
	const util_1 = require_util$1();
	const FsPromises_1 = require_FsPromises();
	const fs_print_1 = require_lib$3();
	const fsSnapshot = require_lib$2();
	const fs_node_utils_2 = require_lib$6();
	const argErrors_1 = require_argErrors();
	const validators_1 = require_validators();
	const options_1 = require_options();
	const util_2 = require_util$2();
	const readWriteArgs_1 = require_readWriteArgs();
	const Dir_1 = require_Dir();
	const cp_1 = require_cp();
	const { O_SYMLINK, F_OK, R_OK, W_OK, X_OK } = fs_node_utils_1.constants;
	const kMinPoolSpace = 128;
	function pathToSteps(path) {
		return (0, fs_core_1.filenameToSteps)((0, util_2.pathToFilename)(path));
	}
	function dataToStr(data, encoding = fs_node_utils_1.ENCODING_UTF8) {
		if (buffer_1.Buffer.isBuffer(data)) return data.toString(encoding);
		else if (data instanceof Uint8Array) return (0, buffer_1.bufferFrom)(data).toString(encoding);
		else return String(data);
	}
	function toUnixTimestamp(time) {
		if (typeof time === "string" && +time == time) return +time;
		if (time instanceof Date) return time.getTime() / 1e3;
		if (isFinite(time)) {
			if (time < 0) return Date.now() / 1e3;
			return time;
		}
		throw new Error("Cannot parse time: " + time);
	}
	function validateUid(uid) {
		if (typeof uid !== "number") throw TypeError(fs_node_utils_2.ERRSTR.UID);
	}
	function validateGid(gid) {
		if (typeof gid !== "number") throw TypeError(fs_node_utils_2.ERRSTR.GID);
	}
	var Volume = class {
		get promises() {
			if (this.promisesApi === null) throw new Error("Promise is not supported in this environment.");
			return this.promisesApi;
		}
		constructor(_core = new fs_core_1.Superblock()) {
			this._core = _core;
			this.promisesApi = new FsPromises_1.FsPromises(this, FileHandle_1.FileHandle);
			this.openSync = (path, flags, mode = 438) => {
				const modeNum = (0, util_2.modeToNumber)(mode);
				const fileName = (0, util_2.pathToFilename)(path);
				const flagsNum = (0, util_2.flagsToNumber)(flags);
				return this._core.open(fileName, flagsNum, modeNum, !(flagsNum & O_SYMLINK));
			};
			this.open = (path, flags, a, b) => {
				let mode = a;
				let callback = b;
				if (typeof a === "function") {
					mode = 438;
					callback = a;
				}
				mode = mode || 438;
				const modeNum = (0, util_2.modeToNumber)(mode);
				const fileName = (0, util_2.pathToFilename)(path);
				const flagsNum = (0, util_2.flagsToNumber)(flags);
				this.wrapAsync(this._core.open, [
					fileName,
					flagsNum,
					modeNum,
					!(flagsNum & O_SYMLINK)
				], callback);
			};
			this.closeSync = (fd) => {
				this._core.close(fd);
			};
			this.close = (fd, callback) => {
				(0, fs_core_1.validateFd)(fd);
				const file = this._core.getFileByFdOrThrow(fd, "close");
				this.wrapAsync(this._core.close, [file.fd], callback);
			};
			this.readv = (fd, buffers, a, b) => {
				(0, validators_1.validateInt32)(fd, "fd", 0);
				const [position, callback] = (0, readWriteArgs_1.getVectorCallbackArgs)(buffers, a, b);
				Promise.resolve().then(() => {
					try {
						if (!buffers.length) throw (0, util_2.createError)("EINVAL", "read");
						callback(null, this._core.readv(fd, buffers, position), buffers);
					} catch (err) {
						callback(err, 0, buffers);
					}
				});
			};
			this.readvSync = (fd, buffers, position) => {
				const seek = (0, readWriteArgs_1.getVectorArgs)(buffers, position);
				(0, fs_core_1.validateFd)(fd);
				if (!buffers.length) throw (0, util_2.createError)("EINVAL", "read");
				return this._core.readv(fd, buffers, seek);
			};
			this._readfile = (id, flagsNum, encoding) => {
				let result;
				const userOwnsFd = typeof id === "number" && (0, fs_core_1.isFd)(id);
				let fd;
				if (userOwnsFd) fd = id;
				else fd = this.openSync(id, flagsNum);
				try {
					const file = this._core.getFileByFdOrThrow(fd, "fstat");
					if (file.node.isDirectory()) throw (0, util_2.createError)("EISDIR", "read");
					const buffer = file.getBuffer();
					const start = userOwnsFd ? Math.min(file.position, buffer.length) : 0;
					file.position = buffer.length;
					result = (0, util_2.bufferToEncoding)(start ? buffer.subarray(start) : buffer, encoding);
				} finally {
					if (!userOwnsFd) this.closeSync(fd);
				}
				return result;
			};
			this.readFileSync = (file, options) => {
				const opts = (0, options_1.getReadFileOptions)(options);
				const flagsNum = (0, util_2.flagsToNumber)(opts.flag);
				return this._readfile(file, flagsNum, opts.encoding);
			};
			this.readFile = (id, a, b) => {
				const [opts, callback] = (0, options_1.optsAndCbGenerator)(options_1.getReadFileOptions)(a, b);
				const flagsNum = (0, util_2.flagsToNumber)(opts.flag);
				this.wrapAsync(this._readfile, [
					id,
					flagsNum,
					opts.encoding
				], callback);
			};
			this.writeSync = (fd, a, b, c, d) => {
				const [, buf, offset, length, position] = (0, util_2.getWriteSyncArgs)(fd, a, b, c, d);
				return this._write(fd, buf, offset, length, position);
			};
			this.write = (fd, a, b, c, d, e) => {
				const [, , buf, offset, length, position, cb] = (0, util_2.getWriteArgs)(fd, a, b, c, d, e);
				Promise.resolve().then(() => {
					try {
						cb(null, this._write(fd, buf, offset, length, position), a);
					} catch (err) {
						cb(err, 0, a);
					}
				});
			};
			this.writev = (fd, buffers, a, b) => {
				(0, validators_1.validateInt32)(fd, "fd", 0);
				const [position, callback] = (0, readWriteArgs_1.getVectorCallbackArgs)(buffers, a, b);
				if (!buffers.length) {
					queueMicrotask(() => callback(null, 0, buffers));
					return;
				}
				Promise.resolve().then(() => {
					try {
						callback(null, this.writevBase(fd, buffers, position), buffers);
					} catch (err) {
						callback(err, 0, buffers);
					}
				});
			};
			this.writevSync = (fd, buffers, position) => {
				const seek = (0, readWriteArgs_1.getVectorArgs)(buffers, position);
				if (!buffers.length) return 0;
				(0, fs_core_1.validateFd)(fd);
				return this.writevBase(fd, buffers, seek);
			};
			this.writeFileSync = (id, data, options) => {
				const opts = (0, options_1.getWriteFileOptions)(options);
				const flagsNum = (0, util_2.flagsToNumber)(opts.flag);
				const modeNum = (0, util_2.modeToNumber)(opts.mode);
				const buf = (0, fs_core_1.dataToBuffer)(data, opts.encoding);
				this._core.writeFile(id, buf, flagsNum, modeNum);
			};
			this.writeFile = (id, data, a, b) => {
				let options = a;
				let callback = b;
				if (typeof a === "function") [options, callback] = [options_1.writeFileDefaults, a];
				const cb = (0, util_2.validateCallback)(callback);
				const opts = (0, options_1.getWriteFileOptions)(options);
				const flagsNum = (0, util_2.flagsToNumber)(opts.flag);
				const modeNum = (0, util_2.modeToNumber)(opts.mode);
				const buf = (0, fs_core_1.dataToBuffer)(data, opts.encoding);
				this.wrapAsync(this._core.writeFile, [
					id,
					buf,
					flagsNum,
					modeNum
				], cb);
			};
			this.copyFileSync = (src, dest, flags) => {
				const srcFilename = (0, util_2.pathToFilename)(src);
				const destFilename = (0, util_2.pathToFilename)(dest);
				(0, cp_1.copyFileCore)(this._core, srcFilename, destFilename, (0, cp_1.getValidCopyFileMode)(flags));
			};
			this.copyFile = (src, dest, a, b) => {
				const srcFilename = (0, util_2.pathToFilename)(src);
				const destFilename = (0, util_2.pathToFilename)(dest);
				let flags;
				let callback;
				if (typeof a === "function") [flags, callback] = [0, a];
				else [flags, callback] = [a, b];
				(0, util_2.validateCallback)(callback);
				const flagsNum = (0, cp_1.getValidCopyFileMode)(flags);
				Promise.resolve().then(() => {
					try {
						(0, cp_1.copyFileCore)(this._core, srcFilename, destFilename, flagsNum);
					} catch (error) {
						callback(error);
						return;
					}
					callback(null);
				});
			};
			this.linkSync = (existingPath, newPath) => {
				const existingPathFilename = (0, util_2.pathToFilename)(existingPath);
				const newPathFilename = (0, util_2.pathToFilename)(newPath);
				this._core.link(existingPathFilename, newPathFilename);
			};
			this.link = (existingPath, newPath, callback) => {
				const existingPathFilename = (0, util_2.pathToFilename)(existingPath);
				const newPathFilename = (0, util_2.pathToFilename)(newPath);
				this.wrapAsync(this._core.link, [existingPathFilename, newPathFilename], callback);
			};
			this.unlinkSync = (path) => {
				const filename = (0, util_2.pathToFilename)(path);
				this._core.unlink(filename);
			};
			this.unlink = (path, callback) => {
				const filename = (0, util_2.pathToFilename)(path);
				this.wrapAsync(this._core.unlink, [filename], callback);
			};
			this.symlinkSync = (target, path, type) => {
				const targetFilename = (0, util_2.pathToFilename)(target);
				const pathFilename = (0, util_2.pathToFilename)(path);
				this._core.symlink(targetFilename, pathFilename);
			};
			this.symlink = (target, path, a, b) => {
				const callback = (0, util_2.validateCallback)(typeof a === "function" ? a : b);
				const targetFilename = (0, util_2.pathToFilename)(target);
				const pathFilename = (0, util_2.pathToFilename)(path);
				this.wrapAsync(this._core.symlink, [targetFilename, pathFilename], callback);
			};
			this._lstat = (filename, bigint = false, throwIfNoEntry = false) => {
				let link;
				try {
					link = this._core.getLinkOrThrow(filename, "lstat");
				} catch (err) {
					if (err.code === "ENOENT" && !throwIfNoEntry) return void 0;
					else throw err;
				}
				return Stats_1.default.build(link.getNode(), bigint);
			};
			this.lstatSync = (path, options) => {
				const { throwIfNoEntry = true, bigint = false } = (0, options_1.getStatOptions)(options);
				return this._lstat((0, util_2.pathToFilename)(path), bigint, throwIfNoEntry);
			};
			this.renameSync = (oldPath, newPath) => {
				const oldPathFilename = (0, util_2.pathToFilename)(oldPath);
				const newPathFilename = (0, util_2.pathToFilename)(newPath);
				this._core.rename(oldPathFilename, newPathFilename);
			};
			this.rename = (oldPath, newPath, callback) => {
				const oldPathFilename = (0, util_2.pathToFilename)(oldPath);
				const newPathFilename = (0, util_2.pathToFilename)(newPath);
				this.wrapAsync(this._core.rename, [oldPathFilename, newPathFilename], callback);
			};
			this.existsSync = (path) => {
				try {
					return this._exists((0, util_2.pathToFilename)(path)).ok;
				} catch (err) {
					return false;
				}
			};
			this.exists = (path, callback) => {
				const filename = (0, util_2.pathToFilename)(path);
				if (typeof callback !== "function") throw Error(fs_node_utils_2.ERRSTR.CB);
				Promise.resolve().then(() => {
					try {
						callback(this._exists(filename).ok);
					} catch (err) {
						callback(false);
					}
				});
			};
			this.accessSync = (path, mode = F_OK) => {
				const filename = (0, util_2.pathToFilename)(path);
				mode = mode | 0;
				this._access(filename, mode);
			};
			this.access = (path, a, b) => {
				let mode = F_OK;
				let callback;
				if (typeof a !== "function") [mode, callback] = [a | 0, (0, util_2.validateCallback)(b)];
				else callback = a;
				const filename = (0, util_2.pathToFilename)(path);
				this.wrapAsync(this._access, [filename, mode], callback);
			};
			this.appendFileSync = (id, data, options) => {
				const opts = (0, options_1.getAppendFileOpts)(options);
				if (!opts.flag || (0, fs_core_1.isFd)(id)) opts.flag = "a";
				this.writeFileSync(id, data, opts);
			};
			this.appendFile = (id, data, a, b) => {
				const [opts, callback] = (0, options_1.getAppendFileOptsAndCb)(a, b);
				if (!opts.flag || (0, fs_core_1.isFd)(id)) opts.flag = "a";
				this.writeFile(id, data, opts, callback);
			};
			this._readdir = (filename, options) => {
				(0, fs_core_1.filenameToSteps)(filename);
				const link = this._core.getResolvedLinkOrThrow(filename, "scandir");
				const node = link.getNode();
				if (!node.isDirectory()) throw (0, util_2.createError)("ENOTDIR", "scandir", filename);
				if (!node.canRead()) throw (0, util_2.createError)("EACCES", "scandir", filename);
				const list = [];
				for (const name of link.children.keys()) {
					const child = link.getChild(name);
					if (!child || name === "." || name === "..") continue;
					list.push(Dirent_1.default.build(child, options.encoding));
					if (options.recursive && child.children.size) {
						const recurseOptions = {
							...options,
							recursive: true,
							withFileTypes: true
						};
						const childList = this._readdir(child.getPath(), recurseOptions);
						list.push(...childList);
					}
				}
				if (!fs_core_1.isWin && options.encoding !== "buffer") list.sort((a, b) => {
					if (a.name < b.name) return -1;
					if (a.name > b.name) return 1;
					return 0;
				});
				if (options.withFileTypes) return list;
				let filename2 = filename;
				if (fs_core_1.isWin) filename2 = filename2.replace(/\\/g, "/");
				return list.map((dirent) => {
					if (options.recursive) {
						let fullPath = (0, fs_node_utils_2.pathJoin)(dirent.parentPath, dirent.name.toString());
						if (fs_core_1.isWin) fullPath = fullPath.replace(/\\/g, "/");
						return fullPath.replace(filename2 + path_1.posix.sep, "");
					}
					return dirent.name;
				});
			};
			this.readdirSync = (path, options) => {
				const opts = (0, options_1.getReaddirOptions)(options);
				const filename = (0, util_2.pathToFilename)(path);
				return this._readdir(filename, opts);
			};
			this.readdir = (path, a, b) => {
				const [options, callback] = (0, options_1.getReaddirOptsAndCb)(a, b);
				const filename = (0, util_2.pathToFilename)(path);
				this.wrapAsync(this._readdir, [filename, options], callback);
			};
			this._readlink = (filename, encoding) => {
				const node = this._core.getLinkOrThrow(filename, "readlink").getNode();
				if (!node.isSymlink()) throw (0, util_2.createError)("EINVAL", "readlink", filename);
				return (0, fs_node_utils_1.strToEncoding)(node.symlink, encoding);
			};
			this.readlinkSync = (path, options) => {
				const opts = (0, options_1.getDefaultOpts)(options);
				const filename = (0, util_2.pathToFilename)(path);
				return this._readlink(filename, opts.encoding);
			};
			this.readlink = (path, a, b) => {
				const [opts, callback] = (0, options_1.getDefaultOptsAndCb)(a, b);
				const filename = (0, util_2.pathToFilename)(path);
				this.wrapAsync(this._readlink, [filename, opts.encoding], callback);
			};
			this._fsync = (fd) => {
				this._core.getFileByFdOrThrow(fd, "fsync");
			};
			this.fsyncSync = (fd) => {
				this._fsync(fd);
			};
			this.fsync = (fd, callback) => {
				this.wrapAsync(this._fsync, [fd], callback);
			};
			this._fdatasync = (fd) => {
				this._core.getFileByFdOrThrow(fd, "fdatasync");
			};
			this.fdatasyncSync = (fd) => {
				this._fdatasync(fd);
			};
			this.fdatasync = (fd, callback) => {
				this.wrapAsync(this._fdatasync, [fd], callback);
			};
			this._ftruncate = (fd, len) => {
				this._core.ftruncate(fd, len);
			};
			this.ftruncateSync = (fd, len) => {
				this._ftruncate(fd, len);
			};
			this.ftruncate = (fd, a, b) => {
				const len = typeof a === "number" ? a : 0;
				const callback = (0, util_2.validateCallback)(typeof a === "number" ? b : a);
				this.wrapAsync(this._ftruncate, [fd, len], callback);
			};
			this._truncate = (path, len) => {
				const fd = this.openSync(path, "r+");
				try {
					this.ftruncateSync(fd, len);
				} finally {
					this.closeSync(fd);
				}
			};
			this.truncateSync = (id, len) => {
				if ((0, fs_core_1.isFd)(id)) return this.ftruncateSync(id, len);
				this._truncate(id, len);
			};
			this.truncate = (id, a, b) => {
				const len = typeof a === "number" ? a : 0;
				const callback = (0, util_2.validateCallback)(typeof a === "number" ? b : a);
				if ((0, fs_core_1.isFd)(id)) return this.ftruncate(id, len, callback);
				this.wrapAsync(this._truncate, [id, len], callback);
			};
			this._futimes = (fd, atime, mtime) => {
				this._core.futimes(fd, atime, mtime);
			};
			this.futimesSync = (fd, atime, mtime) => {
				this._futimes(fd, toUnixTimestamp(atime), toUnixTimestamp(mtime));
			};
			this.futimes = (fd, atime, mtime, callback) => {
				this.wrapAsync(this._futimes, [
					fd,
					toUnixTimestamp(atime),
					toUnixTimestamp(mtime)
				], callback);
			};
			this._utimes = (filename, atime, mtime, followSymlinks = true) => {
				this._core.utimes(filename, atime, mtime, followSymlinks);
			};
			this.utimesSync = (path, atime, mtime) => {
				this._utimes((0, util_2.pathToFilename)(path), toUnixTimestamp(atime), toUnixTimestamp(mtime), true);
			};
			this.utimes = (path, atime, mtime, callback) => {
				this.wrapAsync(this._utimes, [
					(0, util_2.pathToFilename)(path),
					toUnixTimestamp(atime),
					toUnixTimestamp(mtime),
					true
				], callback);
			};
			this.lutimesSync = (path, atime, mtime) => {
				this._utimes((0, util_2.pathToFilename)(path), toUnixTimestamp(atime), toUnixTimestamp(mtime), false);
			};
			this.lutimes = (path, atime, mtime, callback) => {
				this.wrapAsync(this._utimes, [
					(0, util_2.pathToFilename)(path),
					toUnixTimestamp(atime),
					toUnixTimestamp(mtime),
					false
				], callback);
			};
			this.mkdirSync = (path, options) => {
				const opts = (0, options_1.getMkdirOptions)(options);
				const modeNum = (0, util_2.modeToNumber)(opts.mode, 511);
				const filename = (0, util_2.pathToFilename)(path);
				if (opts.recursive) return this._core.mkdirp(filename, modeNum);
				this._core.mkdir(filename, modeNum);
			};
			this.mkdir = (path, a, b) => {
				const opts = (0, options_1.getMkdirOptions)(a);
				const callback = (0, util_2.validateCallback)(typeof a === "function" ? a : b);
				const modeNum = (0, util_2.modeToNumber)(opts.mode, 511);
				const filename = (0, util_2.pathToFilename)(path);
				if (opts.recursive) this.wrapAsync(this._core.mkdirp, [filename, modeNum], callback);
				else this.wrapAsync(this._core.mkdir, [filename, modeNum], callback);
			};
			this._mkdtemp = (prefix, encoding, retry = 5) => {
				const filename = prefix + (0, util_2.genRndStr6)();
				try {
					this._core.mkdir(filename, 511);
					return (0, fs_node_utils_1.strToEncoding)(filename, encoding);
				} catch (err) {
					if (err.code === "EEXIST") {
						if (retry > 1) return this._mkdtemp(prefix, encoding, retry - 1);
						else throw Error("Could not create temp dir.");
					} else throw err;
				}
			};
			this.mkdtempSync = (prefix, options) => {
				const { encoding } = (0, options_1.getDefaultOpts)(options);
				if (!prefix || typeof prefix !== "string") throw new TypeError("filename prefix is required");
				(0, util_2.nullCheck)(prefix);
				return this._mkdtemp(prefix, encoding);
			};
			this.mkdtemp = (prefix, a, b) => {
				const [{ encoding }, callback] = (0, options_1.getDefaultOptsAndCb)(a, b);
				if (!prefix || typeof prefix !== "string") throw new TypeError("filename prefix is required");
				if (!(0, util_2.nullCheck)(prefix)) return;
				this.wrapAsync(this._mkdtemp, [prefix, encoding], callback);
			};
			this.rmdirSync = (path, options) => {
				const opts = (0, options_1.getRmdirOptions)(options);
				this._core.rmdir((0, util_2.pathToFilename)(path), opts.recursive);
			};
			this.rmdir = (path, a, b) => {
				const opts = (0, options_1.getRmdirOptions)(a);
				const callback = (0, util_2.validateCallback)(typeof a === "function" ? a : b);
				this.wrapAsync(this._core.rmdir, [(0, util_2.pathToFilename)(path), opts.recursive], callback);
			};
			this.rmSync = (path, options) => {
				this._core.rm((0, util_2.pathToFilename)(path), options?.force, options?.recursive);
			};
			this.rm = (path, a, b) => {
				const [opts, callback] = (0, options_1.getRmOptsAndCb)(a, b);
				this.wrapAsync(this._core.rm, [
					(0, util_2.pathToFilename)(path),
					opts?.force,
					opts?.recursive
				], callback);
			};
			this._fchmod = (fd, modeNum) => {
				this._core.fchmod(fd, modeNum);
			};
			this.fchmodSync = (fd, mode) => {
				this._fchmod(fd, (0, util_2.modeToNumber)(mode));
			};
			this.fchmod = (fd, mode, callback) => {
				this.wrapAsync(this._fchmod, [fd, (0, util_2.modeToNumber)(mode)], callback);
			};
			this._chmod = (filename, modeNum, followSymlinks = true) => {
				if (followSymlinks) this._core.chmod(filename, modeNum);
				else this._core.lchmod(filename, modeNum);
			};
			this.chmodSync = (path, mode) => {
				const modeNum = (0, util_2.modeToNumber)(mode);
				const filename = (0, util_2.pathToFilename)(path);
				this._chmod(filename, modeNum, true);
			};
			this.chmod = (path, mode, callback) => {
				const modeNum = (0, util_2.modeToNumber)(mode);
				const filename = (0, util_2.pathToFilename)(path);
				this.wrapAsync(this._chmod, [filename, modeNum], callback);
			};
			this._lchmod = (filename, modeNum) => {
				this._core.lchmod(filename, modeNum);
			};
			this.lchmodSync = (path, mode) => {
				const modeNum = (0, util_2.modeToNumber)(mode);
				const filename = (0, util_2.pathToFilename)(path);
				this._lchmod(filename, modeNum);
			};
			this.lchmod = (path, mode, callback) => {
				const modeNum = (0, util_2.modeToNumber)(mode);
				const filename = (0, util_2.pathToFilename)(path);
				this.wrapAsync(this._lchmod, [filename, modeNum], callback);
			};
			this._fchown = (fd, uid, gid) => {
				this._core.fchown(fd, uid, gid);
			};
			this.fchownSync = (fd, uid, gid) => {
				validateUid(uid);
				validateGid(gid);
				this._fchown(fd, uid, gid);
			};
			this.fchown = (fd, uid, gid, callback) => {
				validateUid(uid);
				validateGid(gid);
				this.wrapAsync(this._fchown, [
					fd,
					uid,
					gid
				], callback);
			};
			this._chown = (filename, uid, gid) => {
				this._core.chown(filename, uid, gid);
			};
			this.chownSync = (path, uid, gid) => {
				validateUid(uid);
				validateGid(gid);
				this._chown((0, util_2.pathToFilename)(path), uid, gid);
			};
			this.chown = (path, uid, gid, callback) => {
				validateUid(uid);
				validateGid(gid);
				this.wrapAsync(this._chown, [
					(0, util_2.pathToFilename)(path),
					uid,
					gid
				], callback);
			};
			this._lchown = (filename, uid, gid) => {
				this._core.lchown(filename, uid, gid);
			};
			this.lchownSync = (path, uid, gid) => {
				validateUid(uid);
				validateGid(gid);
				this._lchown((0, util_2.pathToFilename)(path), uid, gid);
			};
			this.lchown = (path, uid, gid, callback) => {
				validateUid(uid);
				validateGid(gid);
				this.wrapAsync(this._lchown, [
					(0, util_2.pathToFilename)(path),
					uid,
					gid
				], callback);
			};
			this.statWatchers = {};
			this.cpSync = (src, dest, options) => {
				const opts_ = (0, cp_1.getCpOptions)(options);
				const srcFilename = (0, util_2.pathToFilename)(src);
				const destFilename = (0, util_2.pathToFilename)(dest);
				(0, cp_1.cpSync)(this, srcFilename, destFilename, opts_);
			};
			this.cp = (src, dest, a, b) => {
				let options;
				let callback;
				if (typeof a === "function") [options, callback] = [void 0, a];
				else [options, callback] = [a, b];
				(0, util_2.validateCallback)(callback);
				const opts_ = (0, cp_1.getCpOptions)(options);
				const srcFilename = (0, util_2.pathToFilename)(src);
				const destFilename = (0, util_2.pathToFilename)(dest);
				(0, cp_1.cpAsync)(this, srcFilename, destFilename, opts_).then(() => callback(null, void 0), (error) => callback(error));
			};
			this.openAsBlob = async (path, options) => {
				const filename = (0, util_2.pathToFilename)(path);
				let link;
				try {
					link = this._core.getResolvedLinkOrThrow(filename, "open");
				} catch (error) {
					if (error && typeof error === "object" && error.code === "ENOENT") throw (0, argErrors_1.withNativeCode)(/* @__PURE__ */ new TypeError("Unable to open file as blob"), "ERR_INVALID_ARG_VALUE");
					throw error;
				}
				const buffer = link.getNode().getBuffer();
				const type = options?.type || "";
				return new Blob([buffer], { type });
			};
			this.glob = (pattern, options, callback) => {
				if (typeof options === "function") {
					callback = options;
					options = void 0;
				}
				const cb = (0, util_2.validateCallback)(callback);
				const walk = (0, glob_1.globWalk)(this, pattern, options);
				Promise.resolve().then(() => {
					const results = [];
					for (const match of walk) results.push(match);
					return results;
				}).then((results) => cb(null, results), cb);
			};
			this.globSync = (pattern, options) => (0, glob_1.globSync)(this, pattern, options);
			this._opendir = (filename, options, path, errorPath) => {
				const result = this._core.getResolvedLinkResult(filename, "opendir");
				if (!result.ok) throw (0, util_2.createError)(result.err.code, "opendir", errorPath);
				const link = result.value;
				const node = link.getNode();
				if (!node.isDirectory()) throw (0, util_2.createError)("ENOTDIR", "opendir", errorPath);
				if (!node.canRead()) throw (0, util_2.createError)("EACCES", "opendir", errorPath);
				return new Dir_1.Dir(link, path, options);
			};
			this.opendirSync = (path, options) => {
				const filename = (0, util_2.pathToFilename)(path);
				const opts = (0, options_1.getOpendirOptions)(options);
				return this._opendir(filename, opts, path instanceof Uint8Array ? (0, buffer_1.bufferFrom)(path) : filename, "");
			};
			this.opendir = (path, a, b) => {
				const [options, callback] = (0, options_1.getOpendirOptsAndCb)(a, b);
				const filename = (0, util_2.pathToFilename)(path);
				const dirPath = path instanceof Uint8Array ? (0, buffer_1.bufferFrom)(path) : filename;
				this.wrapAsync(this._opendir, [
					filename,
					options,
					dirPath,
					filename
				], callback);
			};
			const self = this;
			this.StatWatcher = class extends StatWatcher {
				constructor() {
					super(self);
				}
			};
			const _ReadStream = FsReadStream;
			this.ReadStream = class extends _ReadStream {
				constructor(...args) {
					super(self, ...args);
				}
			};
			const _WriteStream = FsWriteStream;
			this.WriteStream = class extends _WriteStream {
				constructor(...args) {
					super(self, ...args);
				}
			};
			this.FSWatcher = class extends FSWatcher {
				constructor() {
					super(self);
				}
			};
			const _realpath = (filename, encoding) => {
				const realLink = this._core.getResolvedLinkOrThrow(filename, "realpath");
				return (0, fs_node_utils_1.strToEncoding)(realLink.getPath() || "/", encoding);
			};
			const realpathImpl = (path, a, b) => {
				const [opts, callback] = (0, options_1.getRealpathOptsAndCb)(a, b);
				const pathFilename = (0, util_2.pathToFilename)(path);
				self.wrapAsync(_realpath, [pathFilename, opts.encoding], callback);
			};
			const realpathSyncImpl = (path, options) => _realpath((0, util_2.pathToFilename)(path), (0, options_1.getRealpathOptions)(options).encoding);
			this.realpath = realpathImpl;
			this.realpath.native = realpathImpl;
			this.realpathSync = realpathSyncImpl;
			this.realpathSync.native = realpathSyncImpl;
			this.readSync = function(fd, a, b, c, d) {
				const { buffer, offset, length, position } = (0, readWriteArgs_1.getReadSyncArgs)(arguments.length, a, b, c, d);
				(0, fs_core_1.validateFd)(fd);
				return self._core.read(fd, buffer, offset, length, position);
			};
			this.read = function(fd, a, b, c, d, e) {
				(0, validators_1.validateInt32)(fd, "fd", 0);
				const { buffer, offset, length, position, callback } = (0, readWriteArgs_1.getReadArgs)(arguments.length, a, b, c, d, e);
				if (length === 0) {
					queueMicrotask(() => callback(null, 0, buffer));
					return;
				}
				Promise.resolve().then(() => {
					try {
						callback(null, self._core.read(fd, buffer, offset, length, position), buffer);
					} catch (err) {
						callback(err, 0, buffer);
					}
				});
			};
		}
		wrapAsync(method, args, callback) {
			(0, util_2.validateCallback)(callback);
			Promise.resolve().then(() => {
				let result;
				try {
					result = method.apply(this, args);
				} catch (err) {
					callback(err);
					return;
				}
				callback(null, result);
			});
		}
		reset() {
			this._core.reset();
		}
		toJSON(paths, json = {}, isRelative = false, asBuffer = false) {
			return this._core.toJSON(paths, json, isRelative, asBuffer);
		}
		fromJSON(json, cwd) {
			return this._core.fromJSON(json, cwd);
		}
		fromNestedJSON(json, cwd) {
			return this._core.fromNestedJSON(json, cwd);
		}
		mountSync(mountpoint, json) {
			this._core.fromJSON(json, mountpoint);
		}
		_write(fd, buf, offset, length, position) {
			return this._core.write(fd, buf, offset, length, position);
		}
		writevBase(fd, buffers, position) {
			this._core.getFileByFdOrThrow(fd, "write");
			let p = position;
			let bytesWritten = 0;
			const length = buffers.length;
			for (let i = 0; i < length; i++) {
				const buffer = buffers[i];
				const nodeBuf = buffer_1.Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
				const bytes = this._core.write(fd, nodeBuf, 0, nodeBuf.byteLength, p);
				if (p !== null) p += bytes;
				bytesWritten += bytes;
				if (bytes < nodeBuf.byteLength) break;
			}
			return bytesWritten;
		}
		lstat(path, a, b) {
			const [{ throwIfNoEntry = true, bigint = false }, callback] = (0, options_1.getStatOptsAndCb)(a, b);
			this.wrapAsync(this._lstat, [
				(0, util_2.pathToFilename)(path),
				bigint,
				throwIfNoEntry
			], callback);
		}
		_stat(filename, bigint = false, throwIfNoEntry = true) {
			const result = this._core.getResolvedLinkResult(filename, "stat");
			if (result.ok) return (0, fs_core_1.Ok)(Stats_1.default.build(result.value.getNode(), bigint));
			if (result.err.code === "ENOENT" && !throwIfNoEntry) return (0, fs_core_1.Ok)(void 0);
			else return result;
		}
		_statOrThrow(filename, bigint = false, throwIfNoEntry = true) {
			const result = this._stat(filename, bigint, throwIfNoEntry);
			if (result.ok) return result.value;
			else throw result.err.toError();
		}
		statSync(path, options) {
			const { bigint = true, throwIfNoEntry = true } = (0, options_1.getStatOptions)(options);
			const result = this._stat((0, util_2.pathToFilename)(path), bigint, throwIfNoEntry);
			if (result.ok) return result.value;
			else throw result.err.toError();
		}
		stat(path, a, b) {
			const [{ bigint = false, throwIfNoEntry = true }, callback] = (0, options_1.getStatOptsAndCb)(a, b);
			this.wrapAsync(this._statOrThrow, [
				(0, util_2.pathToFilename)(path),
				bigint,
				throwIfNoEntry
			], callback);
		}
		fstatBase(fd, bigint = false) {
			const file = this._core.getFileByFd(fd);
			if (!file) throw (0, util_2.createError)("EBADF", "fstat");
			return Stats_1.default.build(file.node, bigint);
		}
		fstatSync(fd, options) {
			return this.fstatBase(fd, (0, options_1.getStatOptions)(options).bigint);
		}
		fstat(fd, a, b) {
			const [opts, callback] = (0, options_1.getStatOptsAndCb)(a, b);
			this.wrapAsync(this.fstatBase, [fd, opts.bigint], callback);
		}
		_exists(filename) {
			const result = this._stat(filename);
			return result.ok ? (0, fs_core_1.Ok)(true) : result;
		}
		_access(filename, mode) {
			const node = this._core.getResolvedLinkOrThrow(filename, "access").getNode();
			if (mode === F_OK) return;
			if (mode & R_OK && !node.canRead()) throw (0, util_2.createError)("EACCES", "access", filename);
			if (mode & W_OK && !node.canWrite()) throw (0, util_2.createError)("EACCES", "access", filename);
			if (mode & X_OK && !node.canExecute()) throw (0, util_2.createError)("EACCES", "access", filename);
		}
		watchFile(path, a, b) {
			const filename = (0, util_2.pathToFilename)(path);
			let options = a;
			let listener = b;
			if (typeof options === "function") {
				listener = a;
				options = null;
			}
			if (typeof listener !== "function") throw new TypeError("The \"listener\" argument must be of type function. Received " + typeof listener);
			let interval = 5007;
			let persistent = true;
			let bigint = false;
			if (options && typeof options === "object") {
				if (options.interval !== void 0) {
					if (typeof options.interval !== "number") throw new TypeError("The \"options.interval\" property must be of type number. Received " + typeof options.interval);
					if (!Number.isInteger(options.interval) || options.interval < 0 || options.interval > 4294967295) throw new RangeError(`The value of "options.interval" is out of range. It must be an integer >= 0 && <= 4294967295. Received ${options.interval}`);
					interval = options.interval;
				}
				if (typeof options.persistent === "boolean") persistent = options.persistent;
				if (typeof options.bigint === "boolean") bigint = options.bigint;
			}
			let watcher = this.statWatchers[filename];
			if (!watcher) {
				watcher = new this.StatWatcher();
				watcher.start(filename, persistent, interval, bigint);
				this.statWatchers[filename] = watcher;
			}
			watcher.addListener("change", listener);
			return watcher;
		}
		unwatchFile(path, listener) {
			const filename = (0, util_2.pathToFilename)(path);
			const watcher = this.statWatchers[filename];
			if (!watcher) return;
			if (typeof listener === "function") watcher.removeListener("change", listener);
			else watcher.removeAllListeners("change");
			if (watcher.listenerCount("change") === 0) {
				watcher.stop();
				delete this.statWatchers[filename];
			}
		}
		createReadStream(path, options) {
			return new this.ReadStream(path, options);
		}
		createWriteStream(path, options) {
			return new this.WriteStream(path, options);
		}
		watch(path, options, listener) {
			const filename = (0, util_2.pathToFilename)(path);
			let givenOptions = options;
			if (typeof options === "function") {
				listener = options;
				givenOptions = null;
			}
			let { persistent, recursive, encoding, signal, throwIfNoEntry, ignore } = (0, options_1.getDefaultOpts)(givenOptions);
			if (persistent === void 0) persistent = true;
			if (recursive === void 0) recursive = false;
			const watcher = new this.FSWatcher();
			try {
				watcher.start(filename, persistent, recursive, encoding, ignore);
			} catch (err) {
				if (throwIfNoEntry === false && err.code === "ENOENT") return watcher;
				throw err;
			}
			if (listener) watcher.addListener("change", listener);
			if (signal) {
				if (signal.aborted) watcher.close();
				else {
					const onAbort = () => watcher.close();
					signal.addEventListener("abort", onAbort, { once: true });
					watcher.once("close", () => signal.removeEventListener("abort", onAbort));
				}
			}
			return watcher;
		}
		_statfs(filename, bigint = false) {
			this._core.getResolvedLinkOrThrow(filename, "statfs");
			return StatFs_1.default.build(this._core, bigint);
		}
		statfsSync(path, options) {
			const { bigint = false } = (0, options_1.getStatfsOptions)(options);
			return this._statfs((0, util_2.pathToFilename)(path), bigint);
		}
		statfs(path, a, b) {
			const [{ bigint = false }, callback] = (0, options_1.getStatfsOptsAndCb)(a, b);
			this.wrapAsync(this._statfs, [(0, util_2.pathToFilename)(path), bigint], callback);
		}
		toTree(opts = { separator: path_1.sep }) {
			return (0, fs_print_1.toTreeSync)(this, opts);
		}
		toSnapshot(path = "/") {
			return fsSnapshot.toSnapshotSync({
				fs: this,
				path
			});
		}
		fromSnapshot(snapshot, path = "/") {
			return fsSnapshot.fromSnapshotSync(snapshot, {
				fs: this,
				path
			});
		}
		toBinarySnapshot(path = "/") {
			return fsSnapshot.toBinarySnapshotSync({
				fs: this,
				path
			});
		}
		fromBinarySnapshot(binary, path = "/") {
			return fsSnapshot.fromBinarySnapshotSync(binary, {
				fs: this,
				path
			});
		}
		toJsonSnapshot(path = "/") {
			const uint8 = fsSnapshot.toJsonSnapshotSync({
				fs: this,
				path
			});
			return buffer_1.Buffer.from(uint8).toString("utf8");
		}
		fromJsonSnapshot(json, path = "/") {
			const uint8 = new Uint8Array(buffer_1.Buffer.from(json, "utf8"));
			return fsSnapshot.fromJsonSnapshotSync(uint8, {
				fs: this,
				path
			});
		}
	};
	exports.Volume = Volume;
	Volume.fromJSON = (json, cwd, opts) => new Volume(fs_core_1.Superblock.fromJSON(json, cwd, opts));
	Volume.fromNestedJSON = (json, cwd, opts) => new Volume(fs_core_1.Superblock.fromNestedJSON(json, cwd, opts));
	function emitStop(self) {
		self.emit("stop");
	}
	function buildZeroStats(bigint) {
		const stats = new Stats_1.default();
		const zero = bigint ? BigInt(0) : 0;
		const epoch = /* @__PURE__ */ new Date(0);
		stats.uid = zero;
		stats.gid = zero;
		stats.rdev = zero;
		stats.blksize = zero;
		stats.ino = zero;
		stats.size = zero;
		stats.blocks = zero;
		stats.atime = epoch;
		stats.mtime = epoch;
		stats.ctime = epoch;
		stats.birthtime = epoch;
		stats.atimeMs = zero;
		stats.mtimeMs = zero;
		stats.ctimeMs = zero;
		stats.birthtimeMs = zero;
		if (bigint) {
			stats.atimeNs = zero;
			stats.mtimeNs = zero;
			stats.ctimeNs = zero;
			stats.birthtimeNs = zero;
		}
		stats.dev = zero;
		stats.mode = zero;
		stats.nlink = zero;
		return stats;
	}
	var StatWatcher = class extends events_1.EventEmitter {
		constructor(vol) {
			super();
			this.bigint = false;
			this.fileExists = false;
			this.stopped = false;
			this.onInterval = () => {
				if (this.stopped) return;
				const stats = this.statSafe();
				if (stats) {
					if (!this.fileExists) {
						this.fileExists = true;
						const prev = this.prev;
						this.prev = stats;
						this.emit("change", stats, prev);
					} else if (this.hasChanged(stats)) {
						const prev = this.prev;
						this.prev = stats;
						this.emit("change", stats, prev);
					}
				} else if (this.fileExists) {
					this.fileExists = false;
					this.emit("change", buildZeroStats(this.bigint), this.prev);
				}
				this.loop();
			};
			this.vol = vol;
		}
		loop() {
			clearTimeout(this.timeoutRef);
			this.timeoutRef = this.setTimeout(this.onInterval, this.interval);
		}
		hasChanged(stats) {
			const prev = this.prev;
			return stats.mtimeMs !== prev.mtimeMs || stats.ctimeMs !== prev.ctimeMs || stats.size !== prev.size || stats.ino !== prev.ino || stats.mode !== prev.mode || stats.uid !== prev.uid || stats.gid !== prev.gid || stats.nlink !== prev.nlink;
		}
		statSafe() {
			try {
				return this.bigint ? this.vol.statSync(this.filename, { bigint: true }) : this.vol.statSync(this.filename);
			} catch {
				return null;
			}
		}
		start(path, persistent = true, interval = 5007, bigint = false) {
			this.filename = (0, util_2.pathToFilename)(path);
			this.setTimeout = persistent ? setTimeout.bind(typeof globalThis !== "undefined" ? globalThis : global) : setTimeoutUnref_1.default;
			this.interval = interval;
			this.bigint = bigint;
			const stats = this.statSafe();
			if (stats) {
				this.prev = stats;
				this.fileExists = true;
			} else {
				this.prev = buildZeroStats(bigint);
				this.fileExists = false;
				queueMicrotask(() => {
					if (!this.stopped) this.emit("change", this.prev, this.prev);
				});
			}
			this.loop();
		}
		stop() {
			this.stopped = true;
			clearTimeout(this.timeoutRef);
			queueMicrotask(() => {
				emitStop.call(this, this);
			});
		}
		ref() {
			this.setTimeout = setTimeout.bind(typeof globalThis !== "undefined" ? globalThis : global);
			const ref = this.timeoutRef;
			if (ref && typeof ref === "object" && typeof ref.ref === "function") ref.ref();
			return this;
		}
		unref() {
			this.setTimeout = setTimeoutUnref_1.default;
			const ref = this.timeoutRef;
			if (ref && typeof ref === "object" && typeof ref.unref === "function") ref.unref();
			return this;
		}
	};
	exports.StatWatcher = StatWatcher;
	var pool;
	function allocNewPool(poolSize) {
		pool = (0, buffer_1.bufferAllocUnsafe)(poolSize);
		pool.used = 0;
	}
	(0, util_1.inherits)(FsReadStream, stream_1.Readable);
	exports.ReadStream = FsReadStream;
	function FsReadStream(vol, path, options) {
		if (!(this instanceof FsReadStream)) return new FsReadStream(vol, path, options);
		this._vol = vol;
		options = Object.assign({}, (0, options_1.getOptions)(options, {}));
		if (options.highWaterMark === void 0) options.highWaterMark = 65536;
		stream_1.Readable.call(this, options);
		this.path = (0, util_2.pathToFilename)(path);
		this._fileHandle = options.fd && typeof options.fd !== "number" ? options.fd : null;
		this.fd = options.fd === void 0 ? null : typeof options.fd !== "number" ? options.fd.fd : options.fd;
		this.flags = options.flags === void 0 ? "r" : options.flags;
		this.mode = options.mode === void 0 ? 438 : options.mode;
		this.start = options.start;
		this.end = options.end;
		this.autoClose = options.autoClose === void 0 ? true : options.autoClose;
		this.pos = void 0;
		this.bytesRead = 0;
		if (this.start !== void 0) {
			if (typeof this.start !== "number") throw new TypeError("\"start\" option must be a Number");
			if (this.end === void 0) this.end = Infinity;
			else if (typeof this.end !== "number") throw new TypeError("\"end\" option must be a Number");
			if (this.start > this.end) throw new Error("\"start\" option must be <= \"end\" option");
			this.pos = this.start;
		}
		if (typeof this.fd !== "number") this.open();
		this.on("end", function() {
			if (this.autoClose) {
				if (this.destroy) this.destroy();
			}
		});
	}
	FsReadStream.prototype.open = function() {
		var self = this;
		this._vol.open(this.path, this.flags, this.mode, (er, fd) => {
			if (er) {
				if (self.autoClose) {
					if (self.destroy) self.destroy();
				}
				self.emit("error", er);
				return;
			}
			self.fd = fd;
			self.emit("open", fd);
			self.read();
		});
	};
	FsReadStream.prototype._read = function(n) {
		if (typeof this.fd !== "number") return this.once("open", function() {
			this._read(n);
		});
		if (this.destroyed) return;
		if (!pool || pool.length - pool.used < kMinPoolSpace) allocNewPool(this._readableState.highWaterMark);
		var thisPool = pool;
		var toRead = Math.min(pool.length - pool.used, n);
		var start = pool.used;
		if (this.pos !== void 0) toRead = Math.min(this.end - this.pos + 1, toRead);
		if (toRead <= 0) return this.push(null);
		var self = this;
		this._vol.read(this.fd, pool, pool.used, toRead, this.pos, onread);
		if (this.pos !== void 0) this.pos += toRead;
		pool.used += toRead;
		function onread(er, bytesRead) {
			if (er) {
				if (self.autoClose && self.destroy) self.destroy();
				self.emit("error", er);
			} else {
				var b = null;
				if (bytesRead > 0) {
					self.bytesRead += bytesRead;
					b = thisPool.slice(start, start + bytesRead);
				}
				self.push(b);
			}
		}
	};
	FsReadStream.prototype._destroy = function(err, cb) {
		this.close((err2) => {
			cb(err || err2);
		});
	};
	FsReadStream.prototype.close = function(cb) {
		if (cb) this.once("close", cb);
		if (this.closed || typeof this.fd !== "number") {
			if (typeof this.fd !== "number") {
				this.once("open", closeOnOpen);
				return;
			}
			return queueMicrotask(() => this.emit("close"));
		}
		if (typeof this._readableState?.closed === "boolean") this._readableState.closed = true;
		else this.closed = true;
		if (this._fileHandle) this._fileHandle.close().then(() => this.emit("close"), (er) => this.emit("error", er));
		else this._vol.close(this.fd, (er) => {
			if (er) this.emit("error", er);
			else this.emit("close");
		});
		this.fd = null;
	};
	function closeOnOpen(fd) {
		this.close();
	}
	(0, util_1.inherits)(FsWriteStream, stream_1.Writable);
	exports.WriteStream = FsWriteStream;
	function FsWriteStream(vol, path, options) {
		if (!(this instanceof FsWriteStream)) return new FsWriteStream(vol, path, options);
		this._vol = vol;
		options = Object.assign({}, (0, options_1.getOptions)(options, {}));
		stream_1.Writable.call(this, options);
		this.path = (0, util_2.pathToFilename)(path);
		this._fileHandle = options.fd && typeof options.fd !== "number" ? options.fd : null;
		this.fd = options.fd === void 0 ? null : typeof options.fd !== "number" ? options.fd.fd : options.fd;
		this.flags = options.flags === void 0 ? "w" : options.flags;
		this.mode = options.mode === void 0 ? 438 : options.mode;
		this.start = options.start;
		this.autoClose = options.autoClose === void 0 ? true : !!options.autoClose;
		this.pos = void 0;
		this.bytesWritten = 0;
		this.pending = true;
		if (this.start !== void 0) {
			if (typeof this.start !== "number") throw new TypeError("\"start\" option must be a Number");
			if (this.start < 0) throw new Error("\"start\" must be >= zero");
			this.pos = this.start;
		}
		if (options.encoding) this.setDefaultEncoding(options.encoding);
		if (typeof this.fd !== "number") this.open();
		this.once("finish", function() {
			if (this.autoClose) this.close();
		});
	}
	FsWriteStream.prototype.open = function() {
		this._vol.open(this.path, this.flags, this.mode, function(er, fd) {
			if (er) {
				if (this.autoClose && this.destroy) this.destroy();
				this.emit("error", er);
				return;
			}
			this.fd = fd;
			this.pending = false;
			this.emit("open", fd);
		}.bind(this));
	};
	FsWriteStream.prototype._write = function(data, encoding, cb) {
		if (!(data instanceof buffer_1.Buffer || data instanceof Uint8Array)) return this.emit("error", /* @__PURE__ */ new Error("Invalid data"));
		if (typeof this.fd !== "number") return this.once("open", function() {
			this._write(data, encoding, cb);
		});
		var self = this;
		this._vol.write(this.fd, data, 0, data.length, this.pos, (er, bytes) => {
			if (er) {
				if (self.autoClose && self.destroy) self.destroy();
				return cb(er);
			}
			self.bytesWritten += bytes;
			cb();
		});
		if (this.pos !== void 0) this.pos += data.length;
	};
	FsWriteStream.prototype._writev = function(data, cb) {
		if (typeof this.fd !== "number") return this.once("open", function() {
			this._writev(data, cb);
		});
		const self = this;
		const len = data.length;
		const chunks = new Array(len);
		var size = 0;
		for (var i = 0; i < len; i++) {
			var chunk = data[i].chunk;
			chunks[i] = chunk;
			size += chunk.length;
		}
		const buf = buffer_1.Buffer.concat(chunks);
		this._vol.write(this.fd, buf, 0, buf.length, this.pos, (er, bytes) => {
			if (er) {
				if (self.destroy) self.destroy();
				return cb(er);
			}
			self.bytesWritten += bytes;
			cb();
		});
		if (this.pos !== void 0) this.pos += size;
	};
	FsWriteStream.prototype.close = function(cb) {
		if (cb) this.once("close", cb);
		if (this.closed || typeof this.fd !== "number") {
			if (typeof this.fd !== "number") {
				this.once("open", closeOnOpen);
				return;
			}
			return queueMicrotask(() => this.emit("close"));
		}
		if (typeof this._writableState?.closed === "boolean") this._writableState.closed = true;
		else this.closed = true;
		if (this._fileHandle) this._fileHandle.close().then(() => this.emit("close"), (er) => this.emit("error", er));
		else this._vol.close(this.fd, (er) => {
			if (er) this.emit("error", er);
			else this.emit("close");
		});
		this.fd = null;
	};
	FsWriteStream.prototype._destroy = FsReadStream.prototype._destroy;
	FsWriteStream.prototype.destroySoon = FsWriteStream.prototype.end;
	var FSWatcher = class extends events_1.EventEmitter {
		constructor(vol) {
			super();
			this._filename = "";
			this._filenameEncoded = "";
			this._recursive = false;
			this._encoding = fs_node_utils_1.ENCODING_UTF8;
			this._closed = false;
			this._onEvent = (event) => {
				switch (event.type) {
					case 0:
					case 1:
						this._emit("rename", event.steps);
						break;
					case 4:
						if (event.oldSteps) this._emit("rename", event.oldSteps);
						this._emit("rename", event.steps);
						break;
					case 2:
					case 3: this._emit("change", event.steps);
				}
			};
			this._persist = () => {
				this._timer = setTimeout(this._persist, 1e6);
			};
			this._vol = vol;
		}
		_emit(type, relativeSteps) {
			const filename = relativeSteps.length ? relativeSteps.join(fs_node_utils_2.pathSep) : this._watcher.link.getName();
			if (this._ignore && this._ignore(filename)) return;
			this.emit("change", type, (0, fs_node_utils_1.strToEncoding)(filename, this._encoding));
		}
		ref() {
			if (this._watcher && !this._closed && !this._timer) this._persist();
			return this;
		}
		unref() {
			clearTimeout(this._timer);
			this._timer = void 0;
			return this;
		}
		start(path, persistent = true, recursive = false, encoding = fs_node_utils_1.ENCODING_UTF8, ignore) {
			this._filename = (0, util_2.pathToFilename)(path);
			this._steps = (0, fs_core_1.filenameToSteps)(this._filename);
			this._filenameEncoded = (0, fs_node_utils_1.strToEncoding)(this._filename);
			this._recursive = recursive;
			this._encoding = encoding;
			this._ignore = ignore === void 0 ? void 0 : (0, fs_node_utils_1.watchIgnoreToMatcher)(ignore);
			try {
				this._watcher = new fs_core_1.CoreWatcher(this._vol._core, this._filename, { recursive });
			} catch (err) {
				throw (0, util_2.createWatchError)(err.code, this._filename);
			}
			this._link = this._watcher.link;
			this._watcher.changes.listen(this._onEvent);
			if (persistent) this._persist();
		}
		close() {
			clearTimeout(this._timer);
			this._timer = void 0;
			if (!this._watcher || this._closed) return;
			this._closed = true;
			this._watcher.close();
			queueMicrotask(() => this.emit("close"));
		}
	};
	exports.FSWatcher = FSWatcher;
}));
//#endregion
//#region ../../node_modules/.pnpm/@jsonjoy.com+fs-node@4.80.0_tslib@2.8.1/node_modules/@jsonjoy.com/fs-node/lib/index.js
var require_lib$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.fsCommonObjectsList = exports.fsSynchronousApiList = exports.fsCallbackApiList = exports.FsPromises = exports.Dir = exports.FileHandle = exports.StatFs = exports.Dirent = exports.Stats = exports.toUnixTimestamp = exports.FSWatcher = exports.StatWatcher = exports.Volume = void 0;
	const tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
	var volume_1 = require_volume();
	Object.defineProperty(exports, "Volume", {
		enumerable: true,
		get: function() {
			return volume_1.Volume;
		}
	});
	Object.defineProperty(exports, "StatWatcher", {
		enumerable: true,
		get: function() {
			return volume_1.StatWatcher;
		}
	});
	Object.defineProperty(exports, "FSWatcher", {
		enumerable: true,
		get: function() {
			return volume_1.FSWatcher;
		}
	});
	Object.defineProperty(exports, "toUnixTimestamp", {
		enumerable: true,
		get: function() {
			return volume_1.toUnixTimestamp;
		}
	});
	var Stats_1 = require_Stats();
	Object.defineProperty(exports, "Stats", {
		enumerable: true,
		get: function() {
			return Stats_1.default;
		}
	});
	var Dirent_1 = require_Dirent();
	Object.defineProperty(exports, "Dirent", {
		enumerable: true,
		get: function() {
			return Dirent_1.default;
		}
	});
	var StatFs_1 = require_StatFs();
	Object.defineProperty(exports, "StatFs", {
		enumerable: true,
		get: function() {
			return StatFs_1.default;
		}
	});
	var FileHandle_1 = require_FileHandle();
	Object.defineProperty(exports, "FileHandle", {
		enumerable: true,
		get: function() {
			return FileHandle_1.FileHandle;
		}
	});
	var Dir_1 = require_Dir();
	Object.defineProperty(exports, "Dir", {
		enumerable: true,
		get: function() {
			return Dir_1.Dir;
		}
	});
	var FsPromises_1 = require_FsPromises();
	Object.defineProperty(exports, "FsPromises", {
		enumerable: true,
		get: function() {
			return FsPromises_1.FsPromises;
		}
	});
	tslib_1.__exportStar(require_options(), exports);
	tslib_1.__exportStar(require_util$2(), exports);
	tslib_1.__exportStar(require_glob(), exports);
	var fs_node_utils_1 = require_lib$6();
	Object.defineProperty(exports, "fsCallbackApiList", {
		enumerable: true,
		get: function() {
			return fs_node_utils_1.fsCallbackApiList;
		}
	});
	Object.defineProperty(exports, "fsSynchronousApiList", {
		enumerable: true,
		get: function() {
			return fs_node_utils_1.fsSynchronousApiList;
		}
	});
	Object.defineProperty(exports, "fsCommonObjectsList", {
		enumerable: true,
		get: function() {
			return fs_node_utils_1.fsCommonObjectsList;
		}
	});
}));
//#endregion
//#region src/nextjs/disk.ts
var import_lib = (/* @__PURE__ */ __commonJSMin(((exports, module) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.memfs = exports.fs = exports.vol = exports.Volume = void 0;
	exports.createFsFromVolume = createFsFromVolume;
	const fs_node_1 = require_lib$1();
	Object.defineProperty(exports, "Volume", {
		enumerable: true,
		get: function() {
			return fs_node_1.Volume;
		}
	});
	const fs_node_utils_1 = require_lib$6();
	const { F_OK, R_OK, W_OK, X_OK } = fs_node_utils_1.constants;
	const getGlobalProcess = () => {
		return (typeof globalThis !== "undefined" ? globalThis.process : void 0) ?? {};
	};
	const createProcess = (cwd, baseProcess = getGlobalProcess()) => ({
		cwd: () => cwd,
		platform: baseProcess.platform ?? "linux",
		emitWarning: baseProcess.emitWarning?.bind(baseProcess) ?? (() => {}),
		env: baseProcess.env ?? {},
		getuid: baseProcess.getuid?.bind(baseProcess),
		getgid: baseProcess.getgid?.bind(baseProcess)
	});
	exports.vol = fs_node_1.Volume.fromNestedJSON({}, "/", { process: createProcess("/") });
	const kStreams = Symbol("streams");
	const streamSlot = (index) => ({
		get() {
			return this[kStreams][index];
		},
		set(value) {
			this[kStreams][index] = value;
		},
		enumerable: true,
		configurable: true
	});
	const streamDescriptors = {
		ReadStream: streamSlot(0),
		WriteStream: streamSlot(1),
		FileReadStream: streamSlot(2),
		FileWriteStream: streamSlot(3)
	};
	function createFsFromVolume(vol) {
		const fs = {
			F_OK,
			R_OK,
			W_OK,
			X_OK,
			constants: fs_node_utils_1.constants,
			Stats: fs_node_1.Stats,
			Dir: fs_node_1.Dir,
			Dirent: fs_node_1.Dirent
		};
		for (const method of fs_node_1.fsSynchronousApiList) if (typeof vol[method] === "function") fs[method] = vol[method].bind(vol);
		for (const method of fs_node_1.fsCallbackApiList) if (typeof vol[method] === "function") fs[method] = vol[method].bind(vol);
		fs.StatWatcher = vol.StatWatcher;
		fs.FSWatcher = vol.FSWatcher;
		fs[kStreams] = [
			vol.ReadStream,
			vol.WriteStream,
			vol.ReadStream,
			vol.WriteStream
		];
		Object.defineProperties(fs, streamDescriptors);
		fs.promises = vol.promises;
		if (typeof vol.realpath === "function") {
			fs.realpath = vol.realpath.bind(vol);
			if (typeof vol.realpath.native === "function") fs.realpath.native = vol.realpath.native.bind(vol);
		}
		if (typeof vol.realpathSync === "function") {
			fs.realpathSync = vol.realpathSync.bind(vol);
			if (typeof vol.realpathSync.native === "function") fs.realpathSync.native = vol.realpathSync.native.bind(vol);
		}
		fs._toUnixTimestamp = fs_node_1.toUnixTimestamp;
		fs.__vol = vol;
		return fs;
	}
	exports.fs = createFsFromVolume(exports.vol);
	const memfs = (json = {}, cwdOrOpts = "/") => {
		const opts = typeof cwdOrOpts === "string" ? { cwd: cwdOrOpts } : cwdOrOpts;
		const cwd = opts.cwd ?? (opts.process ? void 0 : "/");
		const process = opts.process ?? createProcess(cwd ?? "/");
		const vol = fs_node_1.Volume.fromNestedJSON(json, cwd, { process });
		return {
			fs: createFsFromVolume(vol),
			vol
		};
	};
	exports.memfs = memfs;
	module.exports = {
		...module.exports,
		...exports.fs
	};
	module.exports.semantic = true;
})))();
const diskGlobal = "__vitest_plugin_rsc_disk__";
//#endregion
//#region src/node/fs.ts
const missing = (name) => function() {
	throw new Error(`vitest-plugin-rsc: ${name} of Node.js is not there in the browser`);
};
function createDisk() {
	const volume = new import_lib.Volume();
	const watchers = /* @__PURE__ */ new Set();
	const watching = volume;
	const watch = watching.watch.bind(volume);
	watching.watch = (...args) => {
		const watcher = watch(...args);
		watchers.add(watcher);
		return watcher;
	};
	const fs = (0, import_lib.createFsFromVolume)(volume);
	const reset = () => {
		for (const watcher of watchers) watcher.close();
		watchers.clear();
		for (const watcher of Object.values(watching.statWatchers)) watcher.stop();
		watching.statWatchers = {};
		volume.reset();
		fs.mkdirSync("/tmp");
	};
	reset();
	return {
		fs,
		reset
	};
}
const fs = (globalThis[diskGlobal] ??= createDisk()).fs;
const F_OK = fs.F_OK ?? missing("fs.F_OK");
const R_OK = fs.R_OK ?? missing("fs.R_OK");
const W_OK = fs.W_OK ?? missing("fs.W_OK");
const X_OK = fs.X_OK ?? missing("fs.X_OK");
const promises = fs.promises ?? missing("fs.promises");
const constants = fs.constants ?? missing("fs.constants");
const access = fs.access ?? missing("fs.access");
const appendFile = fs.appendFile ?? missing("fs.appendFile");
const chown = fs.chown ?? missing("fs.chown");
const chmod = fs.chmod ?? missing("fs.chmod");
const copyFile = fs.copyFile ?? missing("fs.copyFile");
const cp = fs.cp ?? missing("fs.cp");
const lchown = fs.lchown ?? missing("fs.lchown");
const lchmod = fs.lchmod ?? missing("fs.lchmod");
const link = fs.link ?? missing("fs.link");
const lstat = fs.lstat ?? missing("fs.lstat");
const lutimes = fs.lutimes ?? missing("fs.lutimes");
const mkdir = fs.mkdir ?? missing("fs.mkdir");
const mkdtemp = fs.mkdtemp ?? missing("fs.mkdtemp");
const realpath = fs.realpath ?? missing("fs.realpath");
const open = fs.open ?? missing("fs.open");
const opendir = fs.opendir ?? missing("fs.opendir");
const readdir = fs.readdir ?? missing("fs.readdir");
const readFile = fs.readFile ?? missing("fs.readFile");
const readlink = fs.readlink ?? missing("fs.readlink");
const rename = fs.rename ?? missing("fs.rename");
const rm = fs.rm ?? missing("fs.rm");
const rmdir = fs.rmdir ?? missing("fs.rmdir");
const stat = fs.stat ?? missing("fs.stat");
const symlink = fs.symlink ?? missing("fs.symlink");
const truncate = fs.truncate ?? missing("fs.truncate");
const unlink = fs.unlink ?? missing("fs.unlink");
const utimes = fs.utimes ?? missing("fs.utimes");
const writeFile = fs.writeFile ?? missing("fs.writeFile");
const statfs = fs.statfs ?? missing("fs.statfs");
const close = fs.close ?? missing("fs.close");
const createReadStream = fs.createReadStream ?? missing("fs.createReadStream");
const createWriteStream = fs.createWriteStream ?? missing("fs.createWriteStream");
const exists = fs.exists ?? missing("fs.exists");
const fchown = fs.fchown ?? missing("fs.fchown");
const fchmod = fs.fchmod ?? missing("fs.fchmod");
const fdatasync = fs.fdatasync ?? missing("fs.fdatasync");
const fstat = fs.fstat ?? missing("fs.fstat");
const fsync = fs.fsync ?? missing("fs.fsync");
const ftruncate = fs.ftruncate ?? missing("fs.ftruncate");
const futimes = fs.futimes ?? missing("fs.futimes");
const lstatSync = fs.lstatSync ?? missing("fs.lstatSync");
const read = fs.read ?? missing("fs.read");
const readv = fs.readv ?? missing("fs.readv");
const realpathSync = fs.realpathSync ?? missing("fs.realpathSync");
const statSync = fs.statSync ?? missing("fs.statSync");
const unwatchFile = fs.unwatchFile ?? missing("fs.unwatchFile");
const watch = fs.watch ?? missing("fs.watch");
const watchFile = fs.watchFile ?? missing("fs.watchFile");
const write = fs.write ?? missing("fs.write");
const writev = fs.writev ?? missing("fs.writev");
const _toUnixTimestamp = fs._toUnixTimestamp ?? missing("fs._toUnixTimestamp");
const openAsBlob = fs.openAsBlob ?? missing("fs.openAsBlob");
const glob = fs.glob ?? missing("fs.glob");
const appendFileSync = fs.appendFileSync ?? missing("fs.appendFileSync");
const accessSync = fs.accessSync ?? missing("fs.accessSync");
const chownSync = fs.chownSync ?? missing("fs.chownSync");
const chmodSync = fs.chmodSync ?? missing("fs.chmodSync");
const closeSync = fs.closeSync ?? missing("fs.closeSync");
const copyFileSync = fs.copyFileSync ?? missing("fs.copyFileSync");
const cpSync = fs.cpSync ?? missing("fs.cpSync");
const existsSync = fs.existsSync ?? missing("fs.existsSync");
const fchownSync = fs.fchownSync ?? missing("fs.fchownSync");
const fchmodSync = fs.fchmodSync ?? missing("fs.fchmodSync");
const fdatasyncSync = fs.fdatasyncSync ?? missing("fs.fdatasyncSync");
const fstatSync = fs.fstatSync ?? missing("fs.fstatSync");
const fsyncSync = fs.fsyncSync ?? missing("fs.fsyncSync");
const ftruncateSync = fs.ftruncateSync ?? missing("fs.ftruncateSync");
const futimesSync = fs.futimesSync ?? missing("fs.futimesSync");
const lchownSync = fs.lchownSync ?? missing("fs.lchownSync");
const lchmodSync = fs.lchmodSync ?? missing("fs.lchmodSync");
const linkSync = fs.linkSync ?? missing("fs.linkSync");
const lutimesSync = fs.lutimesSync ?? missing("fs.lutimesSync");
const mkdirSync = fs.mkdirSync ?? missing("fs.mkdirSync");
const mkdtempSync = fs.mkdtempSync ?? missing("fs.mkdtempSync");
const openSync = fs.openSync ?? missing("fs.openSync");
const opendirSync = fs.opendirSync ?? missing("fs.opendirSync");
const readdirSync = fs.readdirSync ?? missing("fs.readdirSync");
const readSync = fs.readSync ?? missing("fs.readSync");
const readvSync = fs.readvSync ?? missing("fs.readvSync");
const readFileSync = fs.readFileSync ?? missing("fs.readFileSync");
const readlinkSync = fs.readlinkSync ?? missing("fs.readlinkSync");
const renameSync = fs.renameSync ?? missing("fs.renameSync");
const rmSync = fs.rmSync ?? missing("fs.rmSync");
const rmdirSync = fs.rmdirSync ?? missing("fs.rmdirSync");
const symlinkSync = fs.symlinkSync ?? missing("fs.symlinkSync");
const truncateSync = fs.truncateSync ?? missing("fs.truncateSync");
const unlinkSync = fs.unlinkSync ?? missing("fs.unlinkSync");
const utimesSync = fs.utimesSync ?? missing("fs.utimesSync");
const writeFileSync = fs.writeFileSync ?? missing("fs.writeFileSync");
const writeSync = fs.writeSync ?? missing("fs.writeSync");
const writevSync = fs.writevSync ?? missing("fs.writevSync");
const statfsSync = fs.statfsSync ?? missing("fs.statfsSync");
const globSync = fs.globSync ?? missing("fs.globSync");
const Dir = fs.Dir ?? missing("fs.Dir");
const Dirent = fs.Dirent ?? missing("fs.Dirent");
const Stats = fs.Stats ?? missing("fs.Stats");
const ReadStream = fs.ReadStream ?? missing("fs.ReadStream");
const WriteStream = fs.WriteStream ?? missing("fs.WriteStream");
const FileReadStream = fs.FileReadStream ?? missing("fs.FileReadStream");
const FileWriteStream = fs.FileWriteStream ?? missing("fs.FileWriteStream");
//#endregion
export { Dir, Dirent, F_OK, FileReadStream, FileWriteStream, R_OK, ReadStream, Stats, W_OK, WriteStream, X_OK, _toUnixTimestamp, access, accessSync, appendFile, appendFileSync, chmod, chmodSync, chown, chownSync, close, closeSync, constants, copyFile, copyFileSync, cp, cpSync, createReadStream, createWriteStream, fs as default, exists, existsSync, fchmod, fchmodSync, fchown, fchownSync, fdatasync, fdatasyncSync, fstat, fstatSync, fsync, fsyncSync, ftruncate, ftruncateSync, futimes, futimesSync, glob, globSync, lchmod, lchmodSync, lchown, lchownSync, link, linkSync, lstat, lstatSync, lutimes, lutimesSync, mkdir, mkdirSync, mkdtemp, mkdtempSync, open, openAsBlob, openSync, opendir, opendirSync, promises, read, readFile, readFileSync, readSync, readdir, readdirSync, readlink, readlinkSync, readv, readvSync, realpath, realpathSync, rename, renameSync, rm, rmSync, rmdir, rmdirSync, stat, statSync, statfs, statfsSync, symlink, symlinkSync, truncate, truncateSync, unlink, unlinkSync, unwatchFile, utimes, utimesSync, watch, watchFile, write, writeFile, writeFileSync, writeSync, writev, writevSync };
