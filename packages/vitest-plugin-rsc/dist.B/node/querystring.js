//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/querystring/querystring.mjs
var ERR_INVALID_URI = class extends URIError {
	code = "ERR_INVALID_URI";
	constructor() {
		super("URI malformed");
	}
};
const hexTable = Array.from({ length: 256 });
for (let i = 0; i < 256; ++i) hexTable[i] = "%" + String.prototype.toUpperCase.call((i < 16 ? "0" : "") + Number.prototype.toString.call(i, 16));
const isHexTable = new Int8Array([
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
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/querystring.mjs
const unhexTable = new Int8Array([
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	0,
	1,
	2,
	3,
	4,
	5,
	6,
	7,
	8,
	9,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	10,
	11,
	12,
	13,
	14,
	15,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	10,
	11,
	12,
	13,
	14,
	15,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1
]);
function unescapeBuffer(s, decodeSpaces) {
	const out = globalThis.Buffer.allocUnsafe(s.length);
	let index = 0;
	let outIndex = 0;
	let currentChar;
	let nextChar;
	let hexHigh;
	let hexLow;
	const maxLength = s.length - 2;
	let hasHex = false;
	while (index < s.length) {
		currentChar = String.prototype.charCodeAt.call(s, index);
		if (currentChar === 43 && decodeSpaces) {
			out[outIndex++] = 32;
			index++;
			continue;
		}
		if (currentChar === 37 && index < maxLength) {
			currentChar = String.prototype.charCodeAt.call(s, ++index);
			hexHigh = unhexTable[currentChar];
			if (hexHigh >= 0) {
				nextChar = String.prototype.charCodeAt.call(s, ++index);
				hexLow = unhexTable[nextChar];
				if (hexLow >= 0) {
					hasHex = true;
					currentChar = hexHigh * 16 + hexLow;
				} else {
					out[outIndex++] = 37;
					index--;
				}
			} else {
				out[outIndex++] = 37;
				continue;
			}
		}
		out[outIndex++] = currentChar;
		index++;
	}
	return hasHex ? out.slice(0, outIndex) : out;
}
function qsUnescape(s, decodeSpaces) {
	try {
		return decodeURIComponent(s);
	} catch {
		return unescapeBuffer(s, decodeSpaces).toString();
	}
}
const noEscape = new Int8Array([
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
function qsEscape(str) {
	if (typeof str !== "string") {
		if (typeof str === "object") str = String(str);
		else str += "";
	}
	return encodeStr(str, noEscape, hexTable);
}
function stringifyPrimitive(v) {
	if (typeof v === "string") return v;
	if (typeof v === "number" && Number.isFinite(v)) return "" + v;
	if (typeof v === "bigint") return "" + v;
	if (typeof v === "boolean") return v ? "true" : "false";
	return "";
}
function encodeStringified(v, encode) {
	if (typeof v === "string") return v.length > 0 ? encode(v) : "";
	if (typeof v === "number" && Number.isFinite(v)) return Math.abs(v) < 1e21 ? "" + v : encode("" + v);
	if (typeof v === "bigint") return "" + v;
	if (typeof v === "boolean") return v ? "true" : "false";
	return "";
}
function encodeStringifiedCustom(v, encode) {
	return encode(stringifyPrimitive(v));
}
function stringify(obj, sep, eq, options) {
	sep = sep || "&";
	eq = eq || "=";
	let encode = qsEscape;
	if (options && typeof options.encodeURIComponent === "function") encode = options.encodeURIComponent;
	const convert = encode === qsEscape ? encodeStringified : encodeStringifiedCustom;
	if (obj !== null && typeof obj === "object") {
		const keys = Object.keys(obj);
		const len = keys.length;
		let fields = "";
		for (let i = 0; i < len; ++i) {
			const k = keys[i];
			const v = obj[k];
			let ks = convert(k, encode);
			ks += eq;
			if (Array.isArray(v)) {
				const vlen = v.length;
				if (vlen === 0) continue;
				if (fields) fields += sep;
				for (let j = 0; j < vlen; ++j) {
					if (j) fields += sep;
					fields += ks;
					fields += convert(v[j], encode);
				}
			} else {
				if (fields) fields += sep;
				fields += ks;
				fields += convert(v, encode);
			}
		}
		return fields;
	}
	return "";
}
function charCodes(str) {
	if (str.length === 0) return [];
	if (str.length === 1) return [String.prototype.charCodeAt.call(str, 0)];
	const ret = Array.from({ length: str.length });
	for (let i = 0; i < str.length; ++i) ret[i] = String.prototype.charCodeAt.call(str, i);
	return ret;
}
const defSepCodes = [38];
const defEqCodes = [61];
function addKeyVal(obj, key, value, keyEncoded, valEncoded, decode) {
	if (key.length > 0 && keyEncoded) key = decodeStr(key, decode);
	if (value.length > 0 && valEncoded) value = decodeStr(value, decode);
	if (obj[key] === void 0) obj[key] = value;
	else {
		const curValue = obj[key];
		if (curValue.pop) curValue[curValue.length] = value;
		else obj[key] = [curValue, value];
	}
}
function parse(qs, sep, eq, options) {
	const obj = { __proto__: null };
	if (typeof qs !== "string" || qs.length === 0) return obj;
	const sepCodes = sep ? charCodes(String(sep)) : defSepCodes;
	const eqCodes = eq ? charCodes(String(eq)) : defEqCodes;
	const sepLen = sepCodes.length;
	const eqLen = eqCodes.length;
	let pairs = 1e3;
	if (options && typeof options.maxKeys === "number") pairs = options.maxKeys > 0 ? options.maxKeys : -1;
	let decode = qsUnescape;
	if (options && typeof options.decodeURIComponent === "function") decode = options.decodeURIComponent;
	const customDecode = decode !== qsUnescape;
	let lastPos = 0;
	let sepIdx = 0;
	let eqIdx = 0;
	let key = "";
	let value = "";
	let keyEncoded = customDecode;
	let valEncoded = customDecode;
	const plusChar = customDecode ? "%20" : " ";
	let encodeCheck = 0;
	for (let i = 0; i < qs.length; ++i) {
		const code = String.prototype.charCodeAt.call(qs, i);
		if (code === sepCodes[sepIdx]) {
			if (++sepIdx === sepLen) {
				const end = i - sepIdx + 1;
				if (eqIdx < eqLen) {
					if (lastPos < end) key += String.prototype.slice.call(qs, lastPos, end);
					else if (key.length === 0) {
						if (--pairs === 0) return obj;
						lastPos = i + 1;
						sepIdx = eqIdx = 0;
						continue;
					}
				} else if (lastPos < end) value += String.prototype.slice.call(qs, lastPos, end);
				addKeyVal(obj, key, value, keyEncoded, valEncoded, decode);
				if (--pairs === 0) return obj;
				keyEncoded = valEncoded = customDecode;
				key = value = "";
				encodeCheck = 0;
				lastPos = i + 1;
				sepIdx = eqIdx = 0;
			}
		} else {
			sepIdx = 0;
			if (eqIdx < eqLen) {
				if (code === eqCodes[eqIdx]) {
					if (++eqIdx === eqLen) {
						const end = i - eqIdx + 1;
						if (lastPos < end) key += String.prototype.slice.call(qs, lastPos, end);
						encodeCheck = 0;
						lastPos = i + 1;
					}
					continue;
				} else {
					eqIdx = 0;
					if (!keyEncoded) {
						if (code === 37) {
							encodeCheck = 1;
							continue;
						} else if (encodeCheck > 0) {
							if (isHexTable[code] === 1) {
								if (++encodeCheck === 3) keyEncoded = true;
								continue;
							} else encodeCheck = 0;
						}
					}
				}
				if (code === 43) {
					if (lastPos < i) key += String.prototype.slice.call(qs, lastPos, i);
					key += plusChar;
					lastPos = i + 1;
					continue;
				}
			}
			if (code === 43) {
				if (lastPos < i) value += String.prototype.slice.call(qs, lastPos, i);
				value += plusChar;
				lastPos = i + 1;
			} else if (!valEncoded) {
				if (code === 37) encodeCheck = 1;
				else if (encodeCheck > 0) {
					if (isHexTable[code] === 1) {
						if (++encodeCheck === 3) valEncoded = true;
					} else encodeCheck = 0;
				}
			}
		}
	}
	if (lastPos < qs.length) {
		if (eqIdx < eqLen) key += String.prototype.slice.call(qs, lastPos);
		else if (sepIdx < sepLen) value += String.prototype.slice.call(qs, lastPos);
	} else if (eqIdx === 0 && key.length === 0) return obj;
	addKeyVal(obj, key, value, keyEncoded, valEncoded, decode);
	return obj;
}
function decodeStr(s, decoder) {
	try {
		return decoder(s);
	} catch {
		return qsUnescape(s, true);
	}
}
var querystring_default = {
	unescapeBuffer,
	unescape: qsUnescape,
	escape: qsEscape,
	stringify,
	encode: stringify,
	parse,
	decode: parse
};
//#endregion
export { parse as decode, parse, querystring_default as default, stringify as encode, stringify, qsEscape as escape, qsUnescape as unescape, unescapeBuffer };
