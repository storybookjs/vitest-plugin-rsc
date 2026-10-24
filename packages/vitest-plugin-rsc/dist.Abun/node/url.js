import * as querystring from "node:querystring";
import path from "node:path";
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/punycode/punycode.mjs
const maxInt = 2147483647;
const base = 36;
const tMin = 1;
const tMax = 26;
const skew = 38;
const damp = 700;
const initialBias = 72;
const initialN = 128;
const delimiter = "-";
const regexPunycode = /^xn--/;
const regexNonASCII = /[^\0-\u007F]/;
const regexSeparators = /[.\u3002\uFF0E\uFF61]/g;
const errors = {
	overflow: "Overflow: input needs wider integers to process",
	"not-basic": "Illegal input >= 0x80 (not a basic code point)",
	"invalid-input": "Invalid input"
};
const baseMinusTMin = 35;
const floor = Math.floor;
const stringFromCharCode = String.fromCharCode;
function error(type) {
	throw new RangeError(errors[type]);
}
function map(array, callback) {
	const result = [];
	let length = array.length;
	while (length--) result[length] = callback(array[length]);
	return result;
}
function mapDomain(domain, callback) {
	const parts = domain.split("@");
	let result = "";
	if (parts.length > 1) {
		result = parts[0] + "@";
		domain = parts[1];
	}
	domain = domain.replace(regexSeparators, ".");
	const encoded = map(domain.split("."), callback).join(".");
	return result + encoded;
}
function ucs2decode(string) {
	const output = [];
	let counter = 0;
	const length = string.length;
	while (counter < length) {
		const value = string.charCodeAt(counter++);
		if (value >= 55296 && value <= 56319 && counter < length) {
			const extra = string.charCodeAt(counter++);
			if ((extra & 64512) == 56320) output.push(((value & 1023) << 10) + (extra & 1023) + 65536);
			else {
				output.push(value);
				counter--;
			}
		} else output.push(value);
	}
	return output;
}
const basicToDigit = function(codePoint) {
	if (codePoint >= 48 && codePoint < 58) return 26 + (codePoint - 48);
	if (codePoint >= 65 && codePoint < 91) return codePoint - 65;
	if (codePoint >= 97 && codePoint < 123) return codePoint - 97;
	return base;
};
const digitToBasic = function(digit, flag) {
	return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
};
const adapt = function(delta, numPoints, firstTime) {
	let k = 0;
	delta = firstTime ? floor(delta / damp) : delta >> 1;
	delta += floor(delta / numPoints);
	for (; delta > 455; k += base) delta = floor(delta / baseMinusTMin);
	return floor(k + 36 * delta / (delta + skew));
};
const decode = function(input) {
	const output = [];
	const inputLength = input.length;
	let i = 0;
	let n = initialN;
	let bias = initialBias;
	let basic = input.lastIndexOf(delimiter);
	if (basic < 0) basic = 0;
	for (let j = 0; j < basic; ++j) {
		if (input.charCodeAt(j) >= 128) error("not-basic");
		output.push(input.charCodeAt(j));
	}
	for (let index = basic > 0 ? basic + 1 : 0; index < inputLength;) {
		const oldi = i;
		for (let w = 1, k = base;; k += base) {
			if (index >= inputLength) error("invalid-input");
			const digit = basicToDigit(input.charCodeAt(index++));
			if (digit >= base) error("invalid-input");
			if (digit > floor((maxInt - i) / w)) error("overflow");
			i += digit * w;
			const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
			if (digit < t) break;
			const baseMinusT = base - t;
			if (w > floor(maxInt / baseMinusT)) error("overflow");
			w *= baseMinusT;
		}
		const out = output.length + 1;
		bias = adapt(i - oldi, out, oldi === 0);
		if (floor(i / out) > maxInt - n) error("overflow");
		n += floor(i / out);
		i %= out;
		output.splice(i++, 0, n);
	}
	return String.fromCodePoint(...output);
};
const encode = function(_input) {
	const output = [];
	const input = ucs2decode(_input);
	const inputLength = input.length;
	let n = initialN;
	let delta = 0;
	let bias = initialBias;
	for (const currentValue of input) if (currentValue < 128) output.push(stringFromCharCode(currentValue));
	const basicLength = output.length;
	let handledCPCount = basicLength;
	if (basicLength) output.push(delimiter);
	while (handledCPCount < inputLength) {
		let m = maxInt;
		for (const currentValue of input) if (currentValue >= n && currentValue < m) m = currentValue;
		const handledCPCountPlusOne = handledCPCount + 1;
		if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) error("overflow");
		delta += (m - n) * handledCPCountPlusOne;
		n = m;
		for (const currentValue of input) {
			if (currentValue < n && ++delta > maxInt) error("overflow");
			if (currentValue === n) {
				let q = delta;
				for (let k = base;; k += base) {
					const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
					if (q < t) break;
					const qMinusT = q - t;
					const baseMinusT = base - t;
					output.push(stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0)));
					q = floor(qMinusT / baseMinusT);
				}
				output.push(stringFromCharCode(digitToBasic(q, 0)));
				bias = adapt(delta, handledCPCountPlusOne, handledCPCount === basicLength);
				delta = 0;
				++handledCPCount;
			}
		}
		++delta;
		++n;
	}
	return output.join("");
};
const toUnicode = function(input) {
	return mapDomain(input, function(string) {
		return regexPunycode.test(string) ? decode(string.slice(4).toLowerCase()) : string;
	});
};
const toASCII = function(input) {
	return mapDomain(input, function(string) {
		return regexNonASCII.test(string) ? "xn--" + encode(string) : string;
	});
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/querystring/querystring.mjs
var ERR_INVALID_URI = class extends URIError {
	code = "ERR_INVALID_URI";
	constructor() {
		super("URI malformed");
	}
};
const hexTable = Array.from({ length: 256 });
for (let i = 0; i < 256; ++i) hexTable[i] = "%" + String.prototype.toUpperCase.call((i < 16 ? "0" : "") + Number.prototype.toString.call(i, 16));
new Int8Array([
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	1,
	1,
	1,
	1,
	1,
	1,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	1,
	1,
	1,
	1,
	1,
	1,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0
]);
function encodeStr(str, noEscapeTable, hexTable) {
	const len = str.length;
	if (len === 0) return "";
	let out = "";
	let lastPos = 0;
	let i = 0;
	outer: for (; i < len; i++) {
		let c = String.prototype.charCodeAt.call(str, i);
		while (c < 128) {
			if (noEscapeTable[c] !== 1) {
				if (lastPos < i) out += String.prototype.slice.call(str, lastPos, i);
				lastPos = i + 1;
				out += hexTable[c];
			}
			if (++i === len) break outer;
			c = String.prototype.charCodeAt.call(str, i);
		}
		if (lastPos < i) out += String.prototype.slice.call(str, lastPos, i);
		if (c < 2048) {
			lastPos = i + 1;
			out += hexTable[192 | c >> 6] + hexTable[128 | c & 63];
			continue;
		}
		if (c < 55296 || c >= 57344) {
			lastPos = i + 1;
			out += hexTable[224 | c >> 12] + hexTable[128 | c >> 6 & 63] + hexTable[128 | c & 63];
			continue;
		}
		++i;
		if (i >= len) throw new ERR_INVALID_URI();
		const c2 = String.prototype.charCodeAt.call(str, i) & 1023;
		lastPos = i + 1;
		c = 65536 + ((c & 1023) << 10 | c2);
		out += hexTable[240 | c >> 18] + hexTable[128 | c >> 12 & 63] + hexTable[128 | c >> 6 & 63] + hexTable[128 | c & 63];
	}
	if (lastPos === 0) return str;
	if (lastPos < len) return out + String.prototype.slice.call(str, lastPos);
	return out;
}
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/url/util.mjs
function spliceOne(list, index) {
	for (; index + 1 < list.length; index++) list[index] = list[index + 1];
	list.pop();
}
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/url/errors.mjs
function fmt(val) {
	if (Array.isArray(val)) return val.map((v) => fmt(v)).join(" or ");
	if (!val) return "" + val;
	return val.toString();
}
var ERR_INVALID_ARG_VALUE = class extends TypeError {
	code = "ERR_INVALID_ARG_VALUE";
	constructor(name, value, reason) {
		super(`The ${name.includes(".") ? "property" : "argument"} '${name}' ${reason}. Received ${value}`);
	}
};
var ERR_INVALID_ARG_TYPE = class extends TypeError {
	code = "ERR_INVALID_ARG_TYPE";
	constructor(name, expected, actual) {
		super(`The "${name}" argument must be of type ${fmt(expected)}. Received ${fmt(actual)}`);
	}
};
var ERR_INVALID_URL = class extends TypeError {
	code = "ERR_INVALID_URL";
	input;
	base;
	constructor(input, base) {
		super("Invalid URL");
		this.input = input;
		if (base != null) this.base = base;
	}
};
var ERR_INVALID_URL_SCHEME = class extends TypeError {
	code = "ERR_INVALID_URL_SCHEME";
	constructor(expected) {
		super(`The URL must be of scheme ${expected}`);
	}
};
var ERR_INVALID_FILE_URL_PATH = class extends TypeError {
	code = "ERR_INVALID_FILE_URL_PATH";
	constructor(path) {
		super(`Invalid ile URL path: ${path}`);
	}
};
var ERR_INVALID_FILE_URL_HOST = class extends TypeError {
	code = "ERR_INVALID_FILE_URL_HOST";
	constructor(host) {
		super(`File URL host must be "localhost" or empty on ${host}`);
	}
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/url/url.mjs
const unsafeProtocol = /* @__PURE__ */ new Set(["javascript", "javascript:"]);
const hostlessProtocol = /* @__PURE__ */ new Set(["javascript", "javascript:"]);
const slashedProtocol = /* @__PURE__ */ new Set([
	"http",
	"http:",
	"https",
	"https:",
	"ftp",
	"ftp:",
	"gopher",
	"gopher:",
	"file",
	"file:",
	"ws",
	"ws:",
	"wss",
	"wss:"
]);
const FORWARD_SLASH = /\//g;
function pathToFileURL$1(filepath, options) {
	const windows = options?.windows;
	if (windows && String.prototype.startsWith.call(filepath, "\\\\")) {
		const outURL = new URL("file://");
		const prefixLength = String.prototype.startsWith.call(filepath, "\\\\?\\UNC\\") ? 8 : 2;
		const hostnameEndIndex = String.prototype.indexOf.call(filepath, "\\", prefixLength);
		if (hostnameEndIndex === -1) throw new ERR_INVALID_ARG_VALUE("path", filepath, "Missing UNC resource path");
		const hostname = String.prototype.slice.call(filepath, prefixLength, hostnameEndIndex);
		outURL.hostname = toASCII(hostname);
		outURL.pathname = encodePathChars(filepath.slice(hostnameEndIndex).replace(backslashRegEx, "/"), { windows });
		return outURL;
	}
	let resolved = windows ? path.win32.resolve(filepath) : path.posix.resolve(filepath);
	const filePathLast = String.prototype.charCodeAt.call(filepath, filepath.length - 1);
	if ((filePathLast === 47 || windows && filePathLast === 92) && resolved.at(-1) !== path.sep) resolved += "/";
	resolved = encodePathChars(resolved, { windows });
	if (String.prototype.indexOf.call(resolved, "?") !== -1) resolved = resolved.replace(questionRegex, "%3F");
	if (String.prototype.indexOf.call(resolved, "#") !== -1) resolved = resolved.replace(hashRegex, "%23");
	return new URL(`file://${resolved}`);
}
function fileURLToPath$1(path, options) {
	const windows = options?.windows;
	if (typeof path === "string") path = new URL(path);
	else if (!isURL(path)) throw new ERR_INVALID_ARG_TYPE("path", ["string", "URL"], path);
	if (path.protocol !== "file:") throw new ERR_INVALID_URL_SCHEME("file");
	return windows ? getPathFromURLWin32(path) : getPathFromURLPosix(path);
}
function urlToHttpOptions(url) {
	const { hostname, pathname, port, username, password, search } = url;
	return {
		__proto__: null,
		...url,
		protocol: url.protocol,
		hostname: hostname && String.prototype.startsWith.call(hostname, "[") ? String.prototype.slice.call(hostname, 1, -1) : hostname,
		hash: url.hash,
		search,
		pathname,
		path: `${pathname || ""}${search || ""}`,
		href: url.href,
		port: port === "" ? void 0 : Number(port),
		auth: username || password ? `${decodeURIComponent(username)}:${decodeURIComponent(password)}` : void 0
	};
}
const percentRegEx = /%/g;
const backslashRegEx = /\\/g;
const newlineRegEx = /\n/g;
const carriageReturnRegEx = /\r/g;
const tabRegEx = /\t/g;
const questionRegex = /\?/g;
const hashRegex = /#/g;
function encodePathChars(filepath, options) {
	const windows = options?.windows;
	if (String.prototype.indexOf.call(filepath, "%") !== -1) filepath = filepath.replace(percentRegEx, "%25");
	if (!windows && String.prototype.indexOf.call(filepath, "\\") !== -1) filepath = filepath.replace(backslashRegEx, "%5C");
	if (String.prototype.indexOf.call(filepath, "\n") !== -1) filepath = filepath.replace(newlineRegEx, "%0A");
	if (String.prototype.indexOf.call(filepath, "\r") !== -1) filepath = filepath.replace(carriageReturnRegEx, "%0D");
	if (String.prototype.indexOf.call(filepath, "	") !== -1) filepath = filepath.replace(tabRegEx, "%09");
	return filepath;
}
function getPathFromURLWin32(url) {
	const hostname = url.hostname;
	let pathname = url.pathname;
	for (let n = 0; n < pathname.length; n++) if (pathname[n] === "%") {
		const third = pathname.codePointAt(n + 2) | 32;
		if (pathname[n + 1] === "2" && third === 102 || pathname[n + 1] === "5" && third === 99) throw new ERR_INVALID_FILE_URL_PATH(String.raw`must not include encoded \ or / characters`);
	}
	pathname = pathname.replace(FORWARD_SLASH, "\\");
	pathname = decodeURIComponent(pathname);
	if (hostname !== "") return `\\\\${toUnicode(hostname)}${pathname}`;
	const letter = String.prototype.codePointAt.call(pathname, 1) | 32;
	const sep = String.prototype.charAt.call(pathname, 2);
	if (letter < 97 || letter > 122 || sep !== ":") throw new ERR_INVALID_FILE_URL_PATH("must be absolute");
	return String.prototype.slice.call(pathname, 1);
}
function getPathFromURLPosix(url) {
	if (url.hostname !== "") throw new ERR_INVALID_FILE_URL_HOST("??");
	const pathname = url.pathname;
	for (let n = 0; n < pathname.length; n++) if (pathname[n] === "%") {
		const third = String.prototype.codePointAt.call(pathname, n + 2) | 32;
		if (pathname[n + 1] === "2" && third === 102) throw new ERR_INVALID_FILE_URL_PATH("must not include encoded / characters");
	}
	return decodeURIComponent(pathname);
}
function isURL(self) {
	return Boolean(self?.href && self.protocol && self.auth === void 0 && self.path === void 0);
}
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/url.mjs
var Url = class Url {
	auth = null;
	hash = null;
	host = null;
	hostname = null;
	href = null;
	path = null;
	pathname = null;
	protocol = null;
	search = null;
	slashes = null;
	port = null;
	query = null;
	parse(url, parseQueryString, slashesDenoteHost) {
		if (typeof url !== "string") throw new ERR_INVALID_ARG_TYPE("url", "string", url);
		let hasHash = false;
		let hasAt = false;
		let start = -1;
		let end = -1;
		let rest = "";
		let lastPos = 0;
		for (let i = 0, inWs = false, split = false; i < url.length; ++i) {
			const code = url.charCodeAt(i);
			const isWs = code < 33 || code === 160 || code === 65279;
			if (start === -1) {
				if (isWs) continue;
				lastPos = start = i;
			} else if (inWs) {
				if (!isWs) {
					end = -1;
					inWs = false;
				}
			} else if (isWs) {
				end = i;
				inWs = true;
			}
			if (!split) switch (code) {
				case 64:
					hasAt = true;
					break;
				case 35: hasHash = true;
				case 63:
					split = true;
					break;
				case 92:
					if (i - lastPos > 0) rest += url.slice(lastPos, i);
					rest += "/";
					lastPos = i + 1;
			}
			else if (!hasHash && code === 35) hasHash = true;
		}
		if (start !== -1) {
			if (lastPos === start) {
				if (end === -1) {
					if (start === 0) rest = url;
					else rest = url.slice(start);
				} else rest = url.slice(start, end);
			} else if (end === -1 && lastPos < url.length) rest += url.slice(lastPos);
			else if (end !== -1 && lastPos < end) rest += url.slice(lastPos, end);
		}
		if (!slashesDenoteHost && !hasHash && !hasAt) {
			const simplePath = simplePathPattern.exec(rest);
			if (simplePath) {
				this.path = rest;
				this.href = rest;
				this.pathname = simplePath[1];
				if (simplePath[2]) {
					this.search = simplePath[2];
					if (parseQueryString) this.query = querystring.parse(this.search.slice(1));
					else this.query = this.search.slice(1);
				} else if (parseQueryString) {
					this.search = null;
					this.query = { __proto__: null };
				}
				return this;
			}
		}
		const protoMatch = protocolPattern.exec(rest);
		let proto, lowerProto;
		if (protoMatch) {
			proto = protoMatch[0];
			lowerProto = proto.toLowerCase();
			this.protocol = lowerProto;
			rest = rest.slice(proto.length);
		}
		let slashes;
		if (slashesDenoteHost || proto || hostPattern.test(rest)) {
			slashes = rest.charCodeAt(0) === 47 && rest.charCodeAt(1) === 47;
			if (slashes && !(proto && hostlessProtocol.has(lowerProto))) {
				rest = rest.slice(2);
				this.slashes = true;
			}
		}
		if (!hostlessProtocol.has(lowerProto) && (slashes || proto && !slashedProtocol.has(proto))) {
			let hostEnd = -1;
			let atSign = -1;
			let nonHost = -1;
			for (let i = 0; i < rest.length; ++i) {
				switch (rest.charCodeAt(i)) {
					case 9:
					case 10:
					case 13:
						rest = rest.slice(0, i) + rest.slice(i + 1);
						i -= 1;
						break;
					case 32:
					case 34:
					case 37:
					case 39:
					case 59:
					case 60:
					case 62:
					case 92:
					case 94:
					case 96:
					case 123:
					case 124:
					case 125:
						if (nonHost === -1) nonHost = i;
						break;
					case 35:
					case 47:
					case 63:
						if (nonHost === -1) nonHost = i;
						hostEnd = i;
						break;
					case 64:
						atSign = i;
						nonHost = -1;
				}
				if (hostEnd !== -1) break;
			}
			start = 0;
			if (atSign !== -1) {
				this.auth = decodeURIComponent(rest.slice(0, atSign));
				start = atSign + 1;
			}
			if (nonHost === -1) {
				this.host = rest.slice(start);
				rest = "";
			} else {
				this.host = rest.slice(start, nonHost);
				rest = rest.slice(nonHost);
			}
			this.parseHost();
			if (typeof this.hostname !== "string") this.hostname = "";
			const hostname = this.hostname;
			const ipv6Hostname = isIpv6Hostname(hostname);
			if (!ipv6Hostname) rest = getHostname(this, rest, hostname, url);
			if (this.hostname.length > hostnameMaxLen) this.hostname = "";
			else this.hostname = this.hostname.toLowerCase();
			if (this.hostname !== "") {
				if (ipv6Hostname) {
					if (forbiddenHostCharsIpv6.test(this.hostname)) throw new ERR_INVALID_URL(url);
				} else {
					this.hostname = toASCII(this.hostname);
					if (this.hostname === "" || forbiddenHostChars.test(this.hostname)) throw new ERR_INVALID_URL(url);
				}
			}
			const p = this.port ? ":" + this.port : "";
			const h = this.hostname || "";
			this.host = h + p;
			if (ipv6Hostname) {
				this.hostname = this.hostname.slice(1, -1);
				if (rest[0] !== "/") rest = "/" + rest;
			}
		}
		if (!unsafeProtocol.has(lowerProto)) rest = autoEscapeStr(rest);
		let questionIdx = -1;
		let hashIdx = -1;
		for (let i = 0; i < rest.length; ++i) {
			const code = rest.charCodeAt(i);
			if (code === 35) {
				this.hash = rest.slice(i);
				hashIdx = i;
				break;
			} else if (code === 63 && questionIdx === -1) questionIdx = i;
		}
		if (questionIdx !== -1) {
			if (hashIdx === -1) {
				this.search = rest.slice(questionIdx);
				this.query = rest.slice(questionIdx + 1);
			} else {
				this.search = rest.slice(questionIdx, hashIdx);
				this.query = rest.slice(questionIdx + 1, hashIdx);
			}
			if (parseQueryString) this.query = querystring.parse(this.query);
		} else if (parseQueryString) {
			this.search = null;
			this.query = { __proto__: null };
		}
		const firstIdx = questionIdx !== -1 && (hashIdx === -1 || questionIdx < hashIdx) ? questionIdx : hashIdx;
		if (firstIdx === -1) {
			if (rest.length > 0) this.pathname = rest;
		} else if (firstIdx > 0) this.pathname = rest.slice(0, firstIdx);
		if (slashedProtocol.has(lowerProto) && this.hostname && !this.pathname) this.pathname = "/";
		if (this.pathname || this.search) {
			const p = this.pathname || "";
			const s = this.search || "";
			this.path = p + s;
		}
		this.href = this.format();
		return this;
	}
	format() {
		let auth = this.auth || "";
		if (auth) {
			auth = encodeStr(auth, noEscapeAuth, hexTable);
			auth += "@";
		}
		let protocol = this.protocol || "";
		let pathname = this.pathname || "";
		let hash = this.hash || "";
		let host = "";
		let query = "";
		if (this.host) host = auth + this.host;
		else if (this.hostname) {
			host = auth + (this.hostname.includes(":") && !isIpv6Hostname(this.hostname) ? "[" + this.hostname + "]" : this.hostname);
			if (this.port) host += ":" + this.port;
		}
		if (this.query !== null && typeof this.query === "object") query = querystring.stringify(this.query);
		let search = this.search || query && "?" + query || "";
		if (protocol && protocol.charCodeAt(protocol.length - 1) !== 58) protocol += ":";
		let newPathname = "";
		let lastPos = 0;
		for (let i = 0; i < pathname.length; ++i) switch (pathname.charCodeAt(i)) {
			case 35:
				if (i - lastPos > 0) newPathname += pathname.slice(lastPos, i);
				newPathname += "%23";
				lastPos = i + 1;
				break;
			case 63:
				if (i - lastPos > 0) newPathname += pathname.slice(lastPos, i);
				newPathname += "%3F";
				lastPos = i + 1;
		}
		if (lastPos > 0) {
			if (lastPos === pathname.length) pathname = newPathname;
			else pathname = newPathname + pathname.slice(lastPos);
		}
		if (this.slashes || slashedProtocol.has(protocol)) {
			if (this.slashes || host) {
				if (pathname && pathname.charCodeAt(0) !== 47) pathname = "/" + pathname;
				host = "//" + host;
			} else if (protocol.length >= 4 && protocol.charCodeAt(0) === 102 && protocol.charCodeAt(1) === 105 && protocol.charCodeAt(2) === 108 && protocol.charCodeAt(3) === 101) host = "//";
		}
		search = search.replace(/#/g, "%23");
		if (hash && hash.charCodeAt(0) !== 35) hash = "#" + hash;
		if (search && search.charCodeAt(0) !== 63) search = "?" + search;
		return protocol + host + pathname + search + hash;
	}
	resolve(relative) {
		return this.resolveObject(urlParse(relative, false, true)).format();
	}
	resolveObject(relative) {
		if (typeof relative === "string") {
			const rel = new Url();
			rel.parse(relative, false, true);
			relative = rel;
		}
		const result = new Url();
		Object.assign(result, this);
		result.hash = relative.hash;
		if (relative.href === "") {
			result.href = result.format();
			return result;
		}
		if (relative.slashes && !relative.protocol) {
			const relativeWithoutProtocol = Object.keys(relative).reduce((acc, key) => {
				if (key !== "protocol") acc[key] = relative[key];
				return acc;
			}, {});
			Object.assign(result, relativeWithoutProtocol);
			if (slashedProtocol.has(result.protocol) && result.hostname && !result.pathname) result.path = result.pathname = "/";
			result.href = result.format();
			return result;
		}
		if (relative.protocol && relative.protocol !== result.protocol) {
			if (!slashedProtocol.has(relative.protocol)) {
				Object.assign(result, relative);
				result.href = result.format();
				return result;
			}
			result.protocol = relative.protocol;
			if (!relative.host && !/^file:?$/.test(relative.protocol) && !hostlessProtocol.has(relative.protocol)) {
				const relPath = (relative.pathname || "").split("/");
				while (relPath.length > 0 && !(relative.host = relPath.shift()));
				if (!relative.host) relative.host = "";
				if (!relative.hostname) relative.hostname = "";
				if (relPath[0] !== "") relPath.unshift("");
				if (relPath.length < 2) relPath.unshift("");
				result.pathname = relPath.join("/");
			} else result.pathname = relative.pathname;
			result.search = relative.search;
			result.query = relative.query;
			result.host = relative.host || "";
			result.auth = relative.auth;
			result.hostname = relative.hostname || relative.host;
			result.port = relative.port;
			if (result.pathname || result.search) result.path = (result.pathname || "") + (result.search || "");
			result.slashes = result.slashes || relative.slashes;
			result.href = result.format();
			return result;
		}
		const isSourceAbs = result.pathname && result.pathname.charAt(0) === "/";
		const isRelAbs = relative.host || relative.pathname && relative.pathname.charAt(0) === "/";
		let mustEndAbs = isRelAbs || isSourceAbs || result.host && relative.pathname;
		const removeAllDots = mustEndAbs;
		let srcPath = result.pathname && result.pathname.split("/") || [];
		const relPath = relative.pathname && relative.pathname.split("/") || [];
		const noLeadingSlashes = result.protocol && !slashedProtocol.has(result.protocol);
		if (noLeadingSlashes) {
			result.hostname = "";
			result.port = null;
			if (result.host) {
				if (srcPath[0] === "") srcPath[0] = result.host;
				else srcPath.unshift(result.host);
			}
			result.host = "";
			if (relative.protocol) {
				relative.hostname = null;
				relative.port = null;
				result.auth = null;
				if (relative.host) {
					if (relPath[0] === "") relPath[0] = relative.host;
					else relPath.unshift(relative.host);
				}
				relative.host = null;
			}
			mustEndAbs = mustEndAbs && (relPath[0] === "" || srcPath[0] === "");
		}
		if (isRelAbs) {
			if (relative.host || relative.host === "") {
				if (result.host !== relative.host) result.auth = null;
				result.host = relative.host;
				result.port = relative.port;
			}
			if (relative.hostname || relative.hostname === "") {
				if (result.hostname !== relative.hostname) result.auth = null;
				result.hostname = relative.hostname;
			}
			result.search = relative.search;
			result.query = relative.query;
			srcPath = relPath;
		} else if (relPath.length > 0) {
			if (!srcPath) srcPath = [];
			srcPath.pop();
			srcPath = srcPath.concat(relPath);
			result.search = relative.search;
			result.query = relative.query;
		} else if (relative.search !== null && relative.search !== void 0) {
			if (noLeadingSlashes) {
				result.hostname = result.host = srcPath.shift();
				const authInHost = result.host && result.host.indexOf("@") > 0 && result.host.split("@");
				if (authInHost) {
					result.auth = authInHost.shift();
					result.host = result.hostname = authInHost.shift();
				}
			}
			result.search = relative.search;
			result.query = relative.query;
			if (result.pathname !== null || result.search !== null) result.path = (result.pathname ? result.pathname : "") + (result.search ? result.search : "");
			result.href = result.format();
			return result;
		}
		if (srcPath.length === 0) {
			result.pathname = null;
			if (result.search) result.path = "/" + result.search;
			else result.path = null;
			result.href = result.format();
			return result;
		}
		let last = srcPath.at(-1);
		const hasTrailingSlash = (result.host || relative.host || srcPath.length > 1) && (last === "." || last === "..") || last === "";
		let up = 0;
		for (let i = srcPath.length - 1; i >= 0; i--) {
			last = srcPath[i];
			if (last === ".") spliceOne(srcPath, i);
			else if (last === "..") {
				spliceOne(srcPath, i);
				up++;
			} else if (up) {
				spliceOne(srcPath, i);
				up--;
			}
		}
		if (!mustEndAbs && !removeAllDots) while (up--) srcPath.unshift("..");
		if (mustEndAbs && srcPath[0] !== "" && (!srcPath[0] || srcPath[0].charAt(0) !== "/")) srcPath.unshift("");
		if (hasTrailingSlash && srcPath.join("/").slice(-1) !== "/") srcPath.push("");
		const isAbsolute = srcPath[0] === "" || srcPath[0] && srcPath[0].charAt(0) === "/";
		if (noLeadingSlashes) {
			result.hostname = result.host = isAbsolute ? "" : srcPath.length > 0 ? srcPath.shift() : "";
			const authInHost = result.host && result.host.indexOf("@") > 0 ? result.host.split("@") : false;
			if (authInHost) {
				result.auth = authInHost.shift();
				result.host = result.hostname = authInHost.shift();
			}
		}
		mustEndAbs = mustEndAbs || result.host && srcPath.length;
		if (mustEndAbs && !isAbsolute) srcPath.unshift("");
		if (srcPath.length === 0) {
			result.pathname = null;
			result.path = null;
		} else result.pathname = srcPath.join("/");
		if (result.pathname !== null || result.search !== null) result.path = (result.pathname ? result.pathname : "") + (result.search ? result.search : "");
		result.auth = relative.auth || result.auth;
		result.slashes = result.slashes || relative.slashes;
		result.href = result.format();
		return result;
	}
	parseHost() {
		let host = this.host;
		const portMatch = portPattern.exec(host);
		if (portMatch) {
			const port = portMatch[0];
			if (port !== ":") this.port = port.slice(1);
			host = host.slice(0, host.length - port.length);
		}
		if (host) this.hostname = host;
	}
};
const protocolPattern = /^[\d+.a-z-]+:/i;
const portPattern = /:\d*$/;
const hostPattern = /^\/\/[^/@]+@[^/@]+/;
const simplePathPattern = /^(\/\/?(?!\/)[^\s?]*)(\?\S*)?$/;
const forbiddenHostChars = /[\0\t\n\r #%/:<>?@[\\\]^|]/;
const forbiddenHostCharsIpv6 = /[\0\t\n\r #%/<>?@\\^|]/;
const noEscapeAuth = new Int8Array([
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	1,
	0,
	0,
	0,
	0,
	0,
	1,
	1,
	1,
	1,
	0,
	0,
	1,
	1,
	0,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	0,
	0,
	0,
	0,
	0,
	0,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	0,
	0,
	0,
	0,
	1,
	0,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	0,
	0,
	0,
	1,
	0
]);
const escapedCodes = [
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"%09",
	"%0A",
	"",
	"",
	"%0D",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"%20",
	"",
	"%22",
	"",
	"",
	"",
	"",
	"%27",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"%3C",
	"",
	"%3E",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"%5C",
	"",
	"%5E",
	"",
	"%60",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"",
	"%7B",
	"%7C",
	"%7D"
];
const hostnameMaxLen = 255;
let urlParseWarned = false;
function urlParse(url, parseQueryString, slashesDenoteHost) {
	if (!urlParseWarned) {
		urlParseWarned = true;
		console.warn("[DeprecationWarning] [unenv] [node:url] DEP0169: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.");
	}
	if (url instanceof Url) return url;
	const urlObject = new Url();
	urlObject.parse(url, parseQueryString, slashesDenoteHost);
	return urlObject;
}
function isIpv6Hostname(hostname) {
	return String.prototype.charCodeAt.call(hostname, 0) === 91 && String.prototype.charCodeAt.call(hostname, hostname.length - 1) === 93;
}
let warnInvalidPort = true;
function getHostname(self, rest, hostname, url) {
	for (let i = 0; i < hostname.length; ++i) {
		const code = hostname.charCodeAt(i);
		if (!(code !== 47 && code !== 92 && code !== 35 && code !== 63 && code !== 58)) {
			if (warnInvalidPort && code === 58) {
				console.warn(`[DeprecationWarning] [unenv] [node:url] DEP0170: The URL ${url} is invalid. Future versions of Node.js will throw an error.`);
				warnInvalidPort = false;
			}
			self.hostname = hostname.slice(0, i);
			return `/${hostname.slice(i)}${rest}`;
		}
	}
	return rest;
}
function autoEscapeStr(rest) {
	let escaped = "";
	let lastEscapedPos = 0;
	for (let i = 0; i < rest.length; ++i) {
		const escapedChar = escapedCodes[rest.charCodeAt(i)];
		if (escapedChar) {
			if (i > lastEscapedPos) escaped += rest.slice(lastEscapedPos, i);
			escaped += escapedChar;
			lastEscapedPos = i + 1;
		}
	}
	if (lastEscapedPos === 0) return rest;
	if (lastEscapedPos < rest.length) escaped += rest.slice(lastEscapedPos);
	return escaped;
}
function urlFormat(urlObject, options) {
	if (typeof urlObject === "string") urlObject = urlParse(urlObject);
	else if (typeof urlObject !== "object" || urlObject === null) throw new ERR_INVALID_ARG_TYPE("urlObject", ["Object", "string"], urlObject);
	else if (urlObject instanceof URL$1) {
		let fragment = true;
		let unicode = false;
		let search = true;
		let auth = true;
		if (options) {
			if (options.fragment != null) fragment = Boolean(options.fragment);
			if (options.unicode != null) unicode = Boolean(options.unicode);
			if (options.search != null) search = Boolean(options.search);
			if (options.auth != null) auth = Boolean(options.auth);
		}
		const _url = new URL$1(urlObject.href);
		if (!fragment) _url.hash = "";
		if (!search) _url.search = "";
		if (!auth) _url.username = _url.password = "";
		if (unicode) return Url.prototype.format.call(_url);
		return _url.href;
	}
	return Url.prototype.format.call(urlObject);
}
function urlResolve(source, relative) {
	return urlParse(source, false, true).resolve(relative);
}
function urlResolveObject(source, relative) {
	if (!source) return relative;
	return urlParse(source, false, true).resolveObject(relative);
}
function pathToFileURL(path, options) {
	return pathToFileURL$1(path, options);
}
const URL$1 = globalThis.URL;
const URLSearchParams = globalThis.URLSearchParams;
const domainToASCII = toASCII;
const domainToUnicode = toUnicode;
var url_default$1 = {
	Url,
	parse: urlParse,
	resolve: urlResolve,
	resolveObject: urlResolveObject,
	format: urlFormat,
	URL: URL$1,
	URLSearchParams,
	domainToASCII,
	domainToUnicode,
	pathToFileURL,
	fileURLToPath: fileURLToPath$1,
	urlToHttpOptions
};
//#endregion
//#region src/node/url.ts
const fileURLToPath = (url, options) => {
	const parsed = typeof url === "string" ? new URL(url) : url;
	const page = globalThis.location;
	if (!/^https?:$/.test(parsed.protocol) || parsed.origin !== page?.origin) return fileURLToPath$1(url, options);
	return decodeURIComponent(parsed.pathname.replace(/^\/@fs\//, "/"));
};
var url_default = {
	...url_default$1,
	fileURLToPath
};
//#endregion
export { URL$1 as URL, URLSearchParams, Url, url_default as default, domainToASCII, domainToUnicode, fileURLToPath, urlFormat as format, urlParse as parse, pathToFileURL, urlResolve as resolve, urlResolveObject as resolveObject, urlToHttpOptions };
