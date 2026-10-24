import { Buffer as Buffer$1 } from "vitest-plugin-rsc/node/buffer";
import { Transform } from "vitest-plugin-rsc/node/stream";
//#region ../../node_modules/.pnpm/@noble+hashes@2.4.0/node_modules/@noble/hashes/utils.js
function isBytes(a) {
	return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
}
const atitle = (title) => title ? `"${title}" ` : "";
function anumber(n, title = "") {
	if (typeof n !== "number") throw new TypeError(atitle(title) + "expected number, got " + typeof n);
	if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(atitle(title) + "expected integer >= 0, got " + n);
	return n;
}
function abytes(value, length, title = "") {
	if (isBytes(value) && (length === void 0 || value.length === length)) return value;
	if (length !== void 0) anumber(length, "length");
	const bytes = isBytes(value);
	const ofLen = length !== void 0 ? ` of length ${length}` : "";
	const got = bytes ? `length=${value.length}` : `type=${typeof value}`;
	const message = atitle(title) + "expected Uint8Array" + ofLen + ", got " + got;
	if (!bytes) throw new TypeError(message);
	throw new RangeError(message);
}
function ahash(h) {
	if (typeof h !== "function" || typeof h.create !== "function") throw new TypeError("expected hash wrapped by utils.createHasher");
	anumber(h.outputLen);
	anumber(h.blockLen);
	if (h.outputLen < 1 || h.blockLen < 1) throw new Error("hash blockLen / outputLen must be >= 1");
}
const aobject = (value, label) => {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError((label === "object" ? "" : `"${label}" `) + "expected object, got type=" + typeof value);
};
const aopts = (value, label) => {
	aobject(value, label);
	const proto = Object.getPrototypeOf(value);
	if (proto !== Object.prototype && proto !== null) throw new TypeError(`"${label}" expected plain object`);
	if (Object.hasOwn(value, "__proto__")) throw new TypeError(`"${label}.__proto__" is not allowed`);
};
function aexists(instance, checkFinished = true) {
	if (instance.destroyed) throw new Error("hash was destroyed");
	if (checkFinished && instance.finished) throw new Error("digest() was already called");
}
function aoutput(out, instance) {
	abytes(out, void 0, "output");
	const min = instance.outputLen;
	if (!(out.length >= min)) throw new RangeError("\"output\" expected length >= " + min);
}
function clean(...arrays) {
	for (let i = 0; i < arrays.length; i++) arrays[i].fill(0);
}
function createView(arr) {
	return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
	return word << 32 - shift | word >>> shift;
}
function rotl(word, shift) {
	return word << shift | word >>> 32 - shift >>> 0;
}
function checkOpts(defaults, opts, title = "opts") {
	aopts(defaults, "defaults");
	if (opts !== void 0) aopts(opts, title);
	return Object.assign(Object.create(null), defaults, opts);
}
function createHasher(hashCons, info = {}) {
	if (typeof hashCons !== "function") throw new TypeError("\"hashCons\" expected function, got type=" + typeof hashCons);
	info = checkOpts({}, info, "info");
	const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
	const tmp = hashCons(void 0);
	hashC.outputLen = tmp.outputLen;
	hashC.blockLen = tmp.blockLen;
	hashC.canXOF = tmp.canXOF;
	hashC.create = (opts) => hashCons(opts);
	Object.assign(hashC, info);
	return Object.freeze(hashC);
}
const oidNist = (suffix) => ({ oid: Uint8Array.from([
	6,
	9,
	96,
	134,
	72,
	1,
	101,
	3,
	4,
	2,
	suffix
]) });
//#endregion
//#region ../../node_modules/.pnpm/@noble+hashes@2.4.0/node_modules/@noble/hashes/hmac.js
var _HMAC = class {
	oHash;
	iHash;
	blockLen;
	outputLen;
	canXOF = false;
	finished = false;
	destroyed = false;
	constructor(hash, key) {
		ahash(hash);
		abytes(key, void 0, "key");
		this.iHash = hash.create();
		if (typeof this.iHash.update !== "function") throw new Error("expected Hash instance");
		this.blockLen = this.iHash.blockLen;
		this.outputLen = this.iHash.outputLen;
		const blockLen = this.blockLen;
		const pad = new Uint8Array(blockLen);
		pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
		for (let i = 0; i < pad.length; i++) pad[i] ^= 54;
		this.iHash.update(pad);
		this.oHash = hash.create();
		for (let i = 0; i < pad.length; i++) pad[i] ^= 106;
		this.oHash.update(pad);
		clean(pad);
	}
	update(buf) {
		aexists(this);
		this.iHash.update(buf);
		return this;
	}
	digestInto(out) {
		aexists(this);
		aoutput(out, this);
		this.finished = true;
		const buf = out.subarray(0, this.outputLen);
		this.iHash.digestInto(buf);
		this.oHash.update(buf);
		this.oHash.digestInto(buf);
		this.destroy();
	}
	digest() {
		const out = new Uint8Array(this.oHash.outputLen);
		this.digestInto(out);
		return out;
	}
	_cloneInto(to) {
		to ||= Object.create(Object.getPrototypeOf(this), {});
		const { oHash, iHash, finished, destroyed, blockLen, outputLen, canXOF } = this;
		to = to;
		to.finished = finished;
		to.destroyed = destroyed;
		to.blockLen = blockLen;
		to.outputLen = outputLen;
		to.canXOF = canXOF;
		to.oHash = oHash._cloneInto(to.oHash);
		to.iHash = iHash._cloneInto(to.iHash);
		return to;
	}
	clone() {
		return this._cloneInto();
	}
	destroy() {
		this.destroyed = true;
		this.oHash.destroy();
		this.iHash.destroy();
	}
};
const hmac = /* @__PURE__ */ (() => {
	const hmac_ = ((hash, key, message) => new _HMAC(hash, key).update(message).digest());
	hmac_.create = (hash, key) => new _HMAC(hash, key);
	return hmac_;
})();
//#endregion
//#region ../../node_modules/.pnpm/@noble+hashes@2.4.0/node_modules/@noble/hashes/_u64.js
const U32_MASK64 = /* @__PURE__ */ (() => BigInt(2 ** 32 - 1))();
const _32n = /* @__PURE__ */ BigInt(32);
function fromBig(n, le = false) {
	if (le) return {
		h: Number(n & U32_MASK64),
		l: Number(n >> _32n & U32_MASK64)
	};
	return {
		h: Number(n >> _32n & U32_MASK64) | 0,
		l: Number(n & U32_MASK64) | 0
	};
}
function split(lst, le = false) {
	const len = lst.length;
	let Ah = new Uint32Array(len);
	let Al = new Uint32Array(len);
	for (let i = 0; i < len; i++) {
		const { h, l } = fromBig(lst[i], le);
		[Ah[i], Al[i]] = [h, l];
	}
	return [Ah, Al];
}
const fromNumH = (n) => n / 2 ** 32 | 0;
const fromNumL = (n) => n >>> 0;
function setU64FromNum(view, byteOffset, n, isLE) {
	const h = fromNumH(n);
	const l = fromNumL(n);
	view.setUint32(byteOffset, isLE ? l : h, isLE);
	view.setUint32(byteOffset + 4, isLE ? h : l, isLE);
}
const shrSH = (h, _l, s) => h >>> s;
const shrSL = (h, l, s) => h << 32 - s | l >>> s;
const rotrSH = (h, l, s) => h >>> s | l << 32 - s;
const rotrSL = (h, l, s) => h << 32 - s | l >>> s;
const rotrBH = (h, l, s) => h << 64 - s | l >>> s - 32;
const rotrBL = (h, l, s) => h >>> s - 32 | l << 64 - s;
function add(Ah, Al, Bh, Bl) {
	const l = (Al >>> 0) + (Bl >>> 0);
	return {
		h: Ah + Bh + (l / 2 ** 32 | 0) | 0,
		l: l | 0
	};
}
const add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
const add3H = (low, Ah, Bh, Ch) => Ah + Bh + Ch + (low / 2 ** 32 | 0) | 0;
const add4L = (Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0);
const add4H = (low, Ah, Bh, Ch, Dh) => Ah + Bh + Ch + Dh + (low / 2 ** 32 | 0) | 0;
const add5L = (Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0);
const add5H = (low, Ah, Bh, Ch, Dh, Eh) => Ah + Bh + Ch + Dh + Eh + (low / 2 ** 32 | 0) | 0;
//#endregion
//#region ../../node_modules/.pnpm/@noble+hashes@2.4.0/node_modules/@noble/hashes/_md.js
function Chi(a, b, c) {
	return a & b ^ ~a & c;
}
function Maj(a, b, c) {
	return a & b ^ a & c ^ b & c;
}
var HashMD = class {
	blockLen;
	outputLen;
	canXOF = false;
	padOffset;
	isLE;
	buffer;
	view;
	finished = false;
	length = 0;
	pos = 0;
	destroyed = false;
	constructor(blockLen, outputLen, padOffset, isLE) {
		this.blockLen = blockLen;
		this.outputLen = outputLen;
		this.padOffset = padOffset;
		this.isLE = isLE;
		this.buffer = new Uint8Array(blockLen);
		this.view = createView(this.buffer);
	}
	update(data) {
		aexists(this);
		abytes(data);
		const { view, buffer, blockLen } = this;
		const len = data.length;
		let processed = false;
		for (let pos = 0; pos < len;) {
			const take = Math.min(blockLen - this.pos, len - pos);
			if (take === blockLen) {
				const dataView = createView(data);
				for (; blockLen <= len - pos; pos += blockLen) this.process(dataView, pos);
				processed = true;
				continue;
			}
			buffer.set(pos === 0 && take === len ? data : data.subarray(pos, pos + take), this.pos);
			this.pos += take;
			pos += take;
			if (this.pos === blockLen) {
				this.process(view, 0);
				this.pos = 0;
				processed = true;
			}
		}
		this.length += data.length;
		if (processed) this.roundClean();
		return this;
	}
	digestInto(out) {
		aexists(this);
		aoutput(out, this);
		this.finished = true;
		const { buffer, view, blockLen, isLE } = this;
		let { pos } = this;
		buffer[pos++] = 128;
		buffer.fill(0, pos);
		if (this.padOffset > blockLen - pos) {
			this.process(view, 0);
			buffer.fill(0);
		}
		setU64FromNum(view, blockLen - 8, this.length * 8, isLE);
		this.process(view, 0);
		this.roundClean();
		const oview = out === buffer ? view : createView(out);
		const len = this.outputLen;
		const outLen = len / 4;
		const state = this.get();
		if (len % 4 || outLen > state.length) throw new Error("invalid outputLen");
		for (let i = 0; i < outLen; i++) oview.setUint32(4 * i, state[i], isLE);
	}
	digest() {
		const { buffer, outputLen } = this;
		this.digestInto(buffer);
		const res = buffer.slice(0, outputLen);
		this.destroy();
		return res;
	}
	_cloneIntoMeta(to) {
		const { buffer, length, finished, destroyed, pos } = this;
		to.destroyed = destroyed;
		to.finished = finished;
		to.length = length;
		to.pos = pos;
		if (pos) to.buffer.set(buffer);
		return to;
	}
	clone() {
		return this._cloneInto();
	}
};
const SHA256_IV = /* @__PURE__ */ Uint32Array.from([
	1779033703,
	3144134277,
	1013904242,
	2773480762,
	1359893119,
	2600822924,
	528734635,
	1541459225
]);
const SHA224_IV = /* @__PURE__ */ Uint32Array.from([
	3238371032,
	914150663,
	812702999,
	4144912697,
	4290775857,
	1750603025,
	1694076839,
	3204075428
]);
const SHA384_IV = /* @__PURE__ */ Uint32Array.from([
	3418070365,
	3238371032,
	1654270250,
	914150663,
	2438529370,
	812702999,
	355462360,
	4144912697,
	1731405415,
	4290775857,
	2394180231,
	1750603025,
	3675008525,
	1694076839,
	1203062813,
	3204075428
]);
const SHA512_IV = /* @__PURE__ */ Uint32Array.from([
	1779033703,
	4089235720,
	3144134277,
	2227873595,
	1013904242,
	4271175723,
	2773480762,
	1595750129,
	1359893119,
	2917565137,
	2600822924,
	725511199,
	528734635,
	4215389547,
	1541459225,
	327033209
]);
//#endregion
//#region ../../node_modules/.pnpm/@noble+hashes@2.4.0/node_modules/@noble/hashes/legacy.js
const SHA1_IV = /* @__PURE__ */ Uint32Array.from([
	1732584193,
	4023233417,
	2562383102,
	271733878,
	3285377520
]);
const SHA1_W = /* @__PURE__ */ new Uint32Array(80);
var _SHA1 = class extends HashMD {
	A = SHA1_IV[0] | 0;
	B = SHA1_IV[1] | 0;
	C = SHA1_IV[2] | 0;
	D = SHA1_IV[3] | 0;
	E = SHA1_IV[4] | 0;
	constructor() {
		super(64, 20, 8, false);
	}
	get() {
		const { A, B, C, D, E } = this;
		return [
			A,
			B,
			C,
			D,
			E
		];
	}
	set(A, B, C, D, E) {
		this.A = A | 0;
		this.B = B | 0;
		this.C = C | 0;
		this.D = D | 0;
		this.E = E | 0;
	}
	_cloneInto(to) {
		(to ||= new this.constructor()).set(...this.get());
		return this._cloneIntoMeta(to);
	}
	process(view, offset) {
		for (let i = 0; i < 16; i++, offset += 4) SHA1_W[i] = view.getUint32(offset, false);
		for (let i = 16; i < 80; i++) SHA1_W[i] = rotl(SHA1_W[i - 3] ^ SHA1_W[i - 8] ^ SHA1_W[i - 14] ^ SHA1_W[i - 16], 1);
		let { A, B, C, D, E } = this;
		for (let i = 0; i < 80; i++) {
			let F, K;
			if (i < 20) {
				F = Chi(B, C, D);
				K = 1518500249;
			} else if (i < 40) {
				F = B ^ C ^ D;
				K = 1859775393;
			} else if (i < 60) {
				F = Maj(B, C, D);
				K = 2400959708;
			} else {
				F = B ^ C ^ D;
				K = 3395469782;
			}
			const T = rotl(A, 5) + F + E + K + SHA1_W[i] | 0;
			E = D;
			D = C;
			C = rotl(B, 30);
			B = A;
			A = T;
		}
		A = A + this.A | 0;
		B = B + this.B | 0;
		C = C + this.C | 0;
		D = D + this.D | 0;
		E = E + this.E | 0;
		this.set(A, B, C, D, E);
	}
	roundClean() {
		clean(SHA1_W);
	}
	destroy() {
		this.destroyed = true;
		this.set(0, 0, 0, 0, 0);
		clean(this.buffer);
	}
};
const sha1 = /* @__PURE__ */ createHasher(() => new _SHA1());
const p32 = /* @__PURE__ */ Math.pow(2, 32);
const K = /* @__PURE__ */ Array.from({ length: 64 }, (_, i) => Math.floor(p32 * Math.abs(Math.sin(i + 1))));
const MD5_IV = /* @__PURE__ */ SHA1_IV.slice(0, 4);
const MD5_W = /* @__PURE__ */ new Uint32Array(16);
const MD5_SHIFTS = /* @__PURE__ */ (() => {
	const S = [
		[
			7,
			12,
			17,
			22
		],
		[
			5,
			9,
			14,
			20
		],
		[
			4,
			11,
			16,
			23
		],
		[
			6,
			10,
			15,
			21
		]
	];
	return Uint8Array.from({ length: 64 }, (_, i) => S[Math.floor(i / 16)][i % 4]);
})();
var _MD5 = class extends HashMD {
	A = MD5_IV[0] | 0;
	B = MD5_IV[1] | 0;
	C = MD5_IV[2] | 0;
	D = MD5_IV[3] | 0;
	constructor() {
		super(64, 16, 8, true);
	}
	get() {
		const { A, B, C, D } = this;
		return [
			A,
			B,
			C,
			D
		];
	}
	set(A, B, C, D) {
		this.A = A | 0;
		this.B = B | 0;
		this.C = C | 0;
		this.D = D | 0;
	}
	_cloneInto(to) {
		(to ||= new this.constructor()).set(...this.get());
		return this._cloneIntoMeta(to);
	}
	process(view, offset) {
		for (let i = 0; i < 16; i++, offset += 4) MD5_W[i] = view.getUint32(offset, true);
		let { A, B, C, D } = this;
		for (let i = 0; i < 64; i++) {
			let F, g;
			if (i < 16) {
				F = Chi(B, C, D);
				g = i;
			} else if (i < 32) {
				F = Chi(D, B, C);
				g = (5 * i + 1) % 16;
			} else if (i < 48) {
				F = B ^ C ^ D;
				g = (3 * i + 5) % 16;
			} else {
				F = C ^ (B | ~D);
				g = 7 * i % 16;
			}
			F = F + A + K[i] + MD5_W[g];
			A = D;
			D = C;
			C = B;
			B = B + rotl(F, MD5_SHIFTS[i]);
		}
		A = A + this.A | 0;
		B = B + this.B | 0;
		C = C + this.C | 0;
		D = D + this.D | 0;
		this.set(A, B, C, D);
	}
	roundClean() {
		clean(MD5_W);
	}
	destroy() {
		this.destroyed = true;
		this.set(0, 0, 0, 0);
		clean(this.buffer);
	}
};
const md5 = /* @__PURE__ */ createHasher(() => new _MD5());
//#endregion
//#region ../../node_modules/.pnpm/@noble+hashes@2.4.0/node_modules/@noble/hashes/sha2.js
const SHA256_K = /* @__PURE__ */ Uint32Array.from([
	1116352408,
	1899447441,
	3049323471,
	3921009573,
	961987163,
	1508970993,
	2453635748,
	2870763221,
	3624381080,
	310598401,
	607225278,
	1426881987,
	1925078388,
	2162078206,
	2614888103,
	3248222580,
	3835390401,
	4022224774,
	264347078,
	604807628,
	770255983,
	1249150122,
	1555081692,
	1996064986,
	2554220882,
	2821834349,
	2952996808,
	3210313671,
	3336571891,
	3584528711,
	113926993,
	338241895,
	666307205,
	773529912,
	1294757372,
	1396182291,
	1695183700,
	1986661051,
	2177026350,
	2456956037,
	2730485921,
	2820302411,
	3259730800,
	3345764771,
	3516065817,
	3600352804,
	4094571909,
	275423344,
	430227734,
	506948616,
	659060556,
	883997877,
	958139571,
	1322822218,
	1537002063,
	1747873779,
	1955562222,
	2024104815,
	2227730452,
	2361852424,
	2428436474,
	2756734187,
	3204031479,
	3329325298
]);
const SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA2_32B = class extends HashMD {
	A = 0;
	B = 0;
	C = 0;
	D = 0;
	E = 0;
	F = 0;
	G = 0;
	H = 0;
	constructor(outputLen, IV) {
		super(64, outputLen, 8, false);
		this.A = IV[0] | 0;
		this.B = IV[1] | 0;
		this.C = IV[2] | 0;
		this.D = IV[3] | 0;
		this.E = IV[4] | 0;
		this.F = IV[5] | 0;
		this.G = IV[6] | 0;
		this.H = IV[7] | 0;
	}
	get() {
		const { A, B, C, D, E, F, G, H } = this;
		return [
			A,
			B,
			C,
			D,
			E,
			F,
			G,
			H
		];
	}
	set(A, B, C, D, E, F, G, H) {
		this.A = A | 0;
		this.B = B | 0;
		this.C = C | 0;
		this.D = D | 0;
		this.E = E | 0;
		this.F = F | 0;
		this.G = G | 0;
		this.H = H | 0;
	}
	_cloneInto(to) {
		(to ||= new this.constructor()).set(...this.get());
		return this._cloneIntoMeta(to);
	}
	process(view, offset) {
		for (let i = 0; i < 16; i++, offset += 4) SHA256_W[i] = view.getUint32(offset, false);
		for (let i = 16; i < 64; i++) {
			const W15 = SHA256_W[i - 15];
			const W2 = SHA256_W[i - 2];
			const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
			const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
			SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
		}
		let { A, B, C, D, E, F, G, H } = this;
		for (let i = 0; i < 64; i++) {
			const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
			const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
			const T2 = (rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22)) + Maj(A, B, C) | 0;
			H = G;
			G = F;
			F = E;
			E = D + T1 | 0;
			D = C;
			C = B;
			B = A;
			A = T1 + T2 | 0;
		}
		A = A + this.A | 0;
		B = B + this.B | 0;
		C = C + this.C | 0;
		D = D + this.D | 0;
		E = E + this.E | 0;
		F = F + this.F | 0;
		G = G + this.G | 0;
		H = H + this.H | 0;
		this.set(A, B, C, D, E, F, G, H);
	}
	roundClean() {
		clean(SHA256_W);
	}
	destroy() {
		this.destroyed = true;
		this.set(0, 0, 0, 0, 0, 0, 0, 0);
		clean(this.buffer);
	}
};
var _SHA256 = class extends SHA2_32B {
	constructor() {
		super(32, SHA256_IV);
	}
};
var _SHA224 = class extends SHA2_32B {
	constructor() {
		super(28, SHA224_IV);
	}
};
const K512 = /* @__PURE__ */ (() => split([
	"0x428a2f98d728ae22",
	"0x7137449123ef65cd",
	"0xb5c0fbcfec4d3b2f",
	"0xe9b5dba58189dbbc",
	"0x3956c25bf348b538",
	"0x59f111f1b605d019",
	"0x923f82a4af194f9b",
	"0xab1c5ed5da6d8118",
	"0xd807aa98a3030242",
	"0x12835b0145706fbe",
	"0x243185be4ee4b28c",
	"0x550c7dc3d5ffb4e2",
	"0x72be5d74f27b896f",
	"0x80deb1fe3b1696b1",
	"0x9bdc06a725c71235",
	"0xc19bf174cf692694",
	"0xe49b69c19ef14ad2",
	"0xefbe4786384f25e3",
	"0x0fc19dc68b8cd5b5",
	"0x240ca1cc77ac9c65",
	"0x2de92c6f592b0275",
	"0x4a7484aa6ea6e483",
	"0x5cb0a9dcbd41fbd4",
	"0x76f988da831153b5",
	"0x983e5152ee66dfab",
	"0xa831c66d2db43210",
	"0xb00327c898fb213f",
	"0xbf597fc7beef0ee4",
	"0xc6e00bf33da88fc2",
	"0xd5a79147930aa725",
	"0x06ca6351e003826f",
	"0x142929670a0e6e70",
	"0x27b70a8546d22ffc",
	"0x2e1b21385c26c926",
	"0x4d2c6dfc5ac42aed",
	"0x53380d139d95b3df",
	"0x650a73548baf63de",
	"0x766a0abb3c77b2a8",
	"0x81c2c92e47edaee6",
	"0x92722c851482353b",
	"0xa2bfe8a14cf10364",
	"0xa81a664bbc423001",
	"0xc24b8b70d0f89791",
	"0xc76c51a30654be30",
	"0xd192e819d6ef5218",
	"0xd69906245565a910",
	"0xf40e35855771202a",
	"0x106aa07032bbd1b8",
	"0x19a4c116b8d2d0c8",
	"0x1e376c085141ab53",
	"0x2748774cdf8eeb99",
	"0x34b0bcb5e19b48a8",
	"0x391c0cb3c5c95a63",
	"0x4ed8aa4ae3418acb",
	"0x5b9cca4f7763e373",
	"0x682e6ff3d6b2b8a3",
	"0x748f82ee5defb2fc",
	"0x78a5636f43172f60",
	"0x84c87814a1f0ab72",
	"0x8cc702081a6439ec",
	"0x90befffa23631e28",
	"0xa4506cebde82bde9",
	"0xbef9a3f7b2c67915",
	"0xc67178f2e372532b",
	"0xca273eceea26619c",
	"0xd186b8c721c0c207",
	"0xeada7dd6cde0eb1e",
	"0xf57d4f7fee6ed178",
	"0x06f067aa72176fba",
	"0x0a637dc5a2c898a6",
	"0x113f9804bef90dae",
	"0x1b710b35131c471b",
	"0x28db77f523047d84",
	"0x32caab7b40c72493",
	"0x3c9ebe0a15c9bebc",
	"0x431d67c49c100d4c",
	"0x4cc5d4becb3e42b6",
	"0x597f299cfc657e2a",
	"0x5fcb6fab3ad6faec",
	"0x6c44198c4a475817"
].map((n) => BigInt(n))))();
const SHA512_Kh = /* @__PURE__ */ (() => K512[0])();
const SHA512_Kl = /* @__PURE__ */ (() => K512[1])();
const SHA512_W_H = /* @__PURE__ */ new Uint32Array(80);
const SHA512_W_L = /* @__PURE__ */ new Uint32Array(80);
var SHA2_64B = class extends HashMD {
	Ah = 0;
	Al = 0;
	Bh = 0;
	Bl = 0;
	Ch = 0;
	Cl = 0;
	Dh = 0;
	Dl = 0;
	Eh = 0;
	El = 0;
	Fh = 0;
	Fl = 0;
	Gh = 0;
	Gl = 0;
	Hh = 0;
	Hl = 0;
	constructor(outputLen, IV) {
		super(128, outputLen, 16, false);
		this.Ah = IV[0] | 0;
		this.Al = IV[1] | 0;
		this.Bh = IV[2] | 0;
		this.Bl = IV[3] | 0;
		this.Ch = IV[4] | 0;
		this.Cl = IV[5] | 0;
		this.Dh = IV[6] | 0;
		this.Dl = IV[7] | 0;
		this.Eh = IV[8] | 0;
		this.El = IV[9] | 0;
		this.Fh = IV[10] | 0;
		this.Fl = IV[11] | 0;
		this.Gh = IV[12] | 0;
		this.Gl = IV[13] | 0;
		this.Hh = IV[14] | 0;
		this.Hl = IV[15] | 0;
	}
	get() {
		const { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
		return [
			Ah,
			Al,
			Bh,
			Bl,
			Ch,
			Cl,
			Dh,
			Dl,
			Eh,
			El,
			Fh,
			Fl,
			Gh,
			Gl,
			Hh,
			Hl
		];
	}
	set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl) {
		this.Ah = Ah | 0;
		this.Al = Al | 0;
		this.Bh = Bh | 0;
		this.Bl = Bl | 0;
		this.Ch = Ch | 0;
		this.Cl = Cl | 0;
		this.Dh = Dh | 0;
		this.Dl = Dl | 0;
		this.Eh = Eh | 0;
		this.El = El | 0;
		this.Fh = Fh | 0;
		this.Fl = Fl | 0;
		this.Gh = Gh | 0;
		this.Gl = Gl | 0;
		this.Hh = Hh | 0;
		this.Hl = Hl | 0;
	}
	_cloneInto(to) {
		(to ||= new this.constructor()).set(...this.get());
		return this._cloneIntoMeta(to);
	}
	process(view, offset) {
		for (let i = 0; i < 16; i++, offset += 4) {
			SHA512_W_H[i] = view.getUint32(offset);
			SHA512_W_L[i] = view.getUint32(offset += 4);
		}
		for (let i = 16; i < 80; i++) {
			const W15h = SHA512_W_H[i - 15] | 0;
			const W15l = SHA512_W_L[i - 15] | 0;
			const s0h = rotrSH(W15h, W15l, 1) ^ rotrSH(W15h, W15l, 8) ^ shrSH(W15h, W15l, 7);
			const s0l = rotrSL(W15h, W15l, 1) ^ rotrSL(W15h, W15l, 8) ^ shrSL(W15h, W15l, 7);
			const W2h = SHA512_W_H[i - 2] | 0;
			const W2l = SHA512_W_L[i - 2] | 0;
			const s1h = rotrSH(W2h, W2l, 19) ^ rotrBH(W2h, W2l, 61) ^ shrSH(W2h, W2l, 6);
			const s1l = rotrSL(W2h, W2l, 19) ^ rotrBL(W2h, W2l, 61) ^ shrSL(W2h, W2l, 6);
			const SUMl = add4L(s0l, s1l, SHA512_W_L[i - 7], SHA512_W_L[i - 16]);
			const SUMh = add4H(SUMl, s0h, s1h, SHA512_W_H[i - 7], SHA512_W_H[i - 16]);
			SHA512_W_H[i] = SUMh | 0;
			SHA512_W_L[i] = SUMl | 0;
		}
		let { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
		for (let i = 0; i < 80; i++) {
			const sigma1h = rotrSH(Eh, El, 14) ^ rotrSH(Eh, El, 18) ^ rotrBH(Eh, El, 41);
			const sigma1l = rotrSL(Eh, El, 14) ^ rotrSL(Eh, El, 18) ^ rotrBL(Eh, El, 41);
			const CHIh = Eh & Fh ^ ~Eh & Gh;
			const CHIl = El & Fl ^ ~El & Gl;
			const T1ll = add5L(Hl, sigma1l, CHIl, SHA512_Kl[i], SHA512_W_L[i]);
			const T1h = add5H(T1ll, Hh, sigma1h, CHIh, SHA512_Kh[i], SHA512_W_H[i]);
			const T1l = T1ll | 0;
			const sigma0h = rotrSH(Ah, Al, 28) ^ rotrBH(Ah, Al, 34) ^ rotrBH(Ah, Al, 39);
			const sigma0l = rotrSL(Ah, Al, 28) ^ rotrBL(Ah, Al, 34) ^ rotrBL(Ah, Al, 39);
			const MAJh = Ah & Bh ^ Ah & Ch ^ Bh & Ch;
			const MAJl = Al & Bl ^ Al & Cl ^ Bl & Cl;
			Hh = Gh | 0;
			Hl = Gl | 0;
			Gh = Fh | 0;
			Gl = Fl | 0;
			Fh = Eh | 0;
			Fl = El | 0;
			({h: Eh, l: El} = add(Dh | 0, Dl | 0, T1h | 0, T1l | 0));
			Dh = Ch | 0;
			Dl = Cl | 0;
			Ch = Bh | 0;
			Cl = Bl | 0;
			Bh = Ah | 0;
			Bl = Al | 0;
			const All = add3L(T1l, sigma0l, MAJl);
			Ah = add3H(All, T1h, sigma0h, MAJh);
			Al = All | 0;
		}
		({h: Ah, l: Al} = add(this.Ah | 0, this.Al | 0, Ah | 0, Al | 0));
		({h: Bh, l: Bl} = add(this.Bh | 0, this.Bl | 0, Bh | 0, Bl | 0));
		({h: Ch, l: Cl} = add(this.Ch | 0, this.Cl | 0, Ch | 0, Cl | 0));
		({h: Dh, l: Dl} = add(this.Dh | 0, this.Dl | 0, Dh | 0, Dl | 0));
		({h: Eh, l: El} = add(this.Eh | 0, this.El | 0, Eh | 0, El | 0));
		({h: Fh, l: Fl} = add(this.Fh | 0, this.Fl | 0, Fh | 0, Fl | 0));
		({h: Gh, l: Gl} = add(this.Gh | 0, this.Gl | 0, Gh | 0, Gl | 0));
		({h: Hh, l: Hl} = add(this.Hh | 0, this.Hl | 0, Hh | 0, Hl | 0));
		this.set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl);
	}
	roundClean() {
		clean(SHA512_W_H, SHA512_W_L);
	}
	destroy() {
		this.destroyed = true;
		clean(this.buffer);
		this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
	}
};
var _SHA512 = class extends SHA2_64B {
	constructor() {
		super(64, SHA512_IV);
	}
};
var _SHA384 = class extends SHA2_64B {
	constructor() {
		super(48, SHA384_IV);
	}
};
const sha256 = /* @__PURE__ */ createHasher(() => new _SHA256(), /* @__PURE__ */ oidNist(1));
const sha224 = /* @__PURE__ */ createHasher(() => new _SHA224(), /* @__PURE__ */ oidNist(4));
const sha512 = /* @__PURE__ */ createHasher(() => new _SHA512(), /* @__PURE__ */ oidNist(3));
const sha384 = /* @__PURE__ */ createHasher(() => new _SHA384(), /* @__PURE__ */ oidNist(2));
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/crypto/web.mjs
const subtle$1 = globalThis.crypto?.subtle;
const randomUUID$1 = () => {
	return globalThis.crypto?.randomUUID();
};
const getRandomValues$1 = (array) => {
	return globalThis.crypto?.getRandomValues(array);
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
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/crypto/node.mjs
const MAX_RANDOM_VALUE_BYTES = 65536;
const webcrypto$1 = new Proxy(globalThis.crypto, { get(_, key) {
	if (key === "CryptoKey") return globalThis.CryptoKey;
	if (typeof globalThis.crypto[key] === "function") return globalThis.crypto[key].bind(globalThis.crypto);
	return globalThis.crypto[key];
} });
const randomBytes$1 = (size, cb) => {
	const bytes = Buffer.alloc(size, 0, void 0);
	for (let generated = 0; generated < size; generated += MAX_RANDOM_VALUE_BYTES) getRandomValues$1(Uint8Array.prototype.subarray.call(bytes, generated, generated + MAX_RANDOM_VALUE_BYTES));
	if (typeof cb === "function") {
		cb(null, bytes);
		return;
	}
	return bytes;
};
const rng = randomBytes$1;
const prng = randomBytes$1;
const fips = false;
const checkPrime = /* @__PURE__ */ notImplemented("crypto.checkPrime");
const checkPrimeSync = /* @__PURE__ */ notImplemented("crypto.checkPrimeSync");
const createCipher = void 0;
const createDecipher = void 0;
const pseudoRandomBytes = /* @__PURE__ */ notImplemented("crypto.pseudoRandomBytes");
const createCipheriv = /* @__PURE__ */ notImplemented("crypto.createCipheriv");
const createDecipheriv = /* @__PURE__ */ notImplemented("crypto.createDecipheriv");
const createDiffieHellman = /* @__PURE__ */ notImplemented("crypto.createDiffieHellman");
const createDiffieHellmanGroup = /* @__PURE__ */ notImplemented("crypto.createDiffieHellmanGroup");
const createECDH = /* @__PURE__ */ notImplemented("crypto.createECDH");
const createHash$1 = /* @__PURE__ */ notImplemented("crypto.createHash");
const createHmac$1 = /* @__PURE__ */ notImplemented("crypto.createHmac");
const createPrivateKey = /* @__PURE__ */ notImplemented("crypto.createPrivateKey");
const createPublicKey = /* @__PURE__ */ notImplemented("crypto.createPublicKey");
const createSecretKey = /* @__PURE__ */ notImplemented("crypto.createSecretKey");
const createSign = /* @__PURE__ */ notImplemented("crypto.createSign");
const createVerify = /* @__PURE__ */ notImplemented("crypto.createVerify");
const diffieHellman = /* @__PURE__ */ notImplemented("crypto.diffieHellman");
const generatePrime = /* @__PURE__ */ notImplemented("crypto.generatePrime");
const generatePrimeSync = /* @__PURE__ */ notImplemented("crypto.generatePrimeSync");
const getCiphers = /* @__PURE__ */ notImplemented("crypto.getCiphers");
const getCipherInfo = /* @__PURE__ */ notImplemented("crypto.getCipherInfo");
const getCurves = /* @__PURE__ */ notImplemented("crypto.getCurves");
const getDiffieHellman = /* @__PURE__ */ notImplemented("crypto.getDiffieHellman");
const getHashes$1 = /* @__PURE__ */ notImplemented("crypto.getHashes");
const hkdf = /* @__PURE__ */ notImplemented("crypto.hkdf");
const hkdfSync = /* @__PURE__ */ notImplemented("crypto.hkdfSync");
const pbkdf2 = /* @__PURE__ */ notImplemented("crypto.pbkdf2");
const pbkdf2Sync = /* @__PURE__ */ notImplemented("crypto.pbkdf2Sync");
const generateKeyPair = /* @__PURE__ */ notImplemented("crypto.generateKeyPair");
const generateKeyPairSync = /* @__PURE__ */ notImplemented("crypto.generateKeyPairSync");
const generateKey = /* @__PURE__ */ notImplemented("crypto.generateKey");
const generateKeySync = /* @__PURE__ */ notImplemented("crypto.generateKeySync");
const privateDecrypt = /* @__PURE__ */ notImplemented("crypto.privateDecrypt");
const privateEncrypt = /* @__PURE__ */ notImplemented("crypto.privateEncrypt");
const publicDecrypt = /* @__PURE__ */ notImplemented("crypto.publicDecrypt");
const publicEncrypt = /* @__PURE__ */ notImplemented("crypto.publicEncrypt");
const randomFill$1 = /* @__PURE__ */ notImplemented("crypto.randomFill");
const randomFillSync$1 = /* @__PURE__ */ notImplemented("crypto.randomFillSync");
const randomInt$1 = /* @__PURE__ */ notImplemented("crypto.randomInt");
const scrypt = /* @__PURE__ */ notImplemented("crypto.scrypt");
const scryptSync = /* @__PURE__ */ notImplemented("crypto.scryptSync");
const sign = /* @__PURE__ */ notImplemented("crypto.sign");
const setEngine = /* @__PURE__ */ notImplemented("crypto.setEngine");
const timingSafeEqual$1 = /* @__PURE__ */ notImplemented("crypto.timingSafeEqual");
const getFips = /* @__PURE__ */ notImplemented("crypto.getFips");
const setFips = /* @__PURE__ */ notImplemented("crypto.setFips");
const verify = /* @__PURE__ */ notImplemented("crypto.verify");
const secureHeapUsed = /* @__PURE__ */ notImplemented("crypto.secureHeapUsed");
const hash$1 = /* @__PURE__ */ notImplemented("crypto.hash");
const Cipher = void 0;
const Decipher = void 0;
const Certificate = /* @__PURE__ */ notImplementedClass("crypto.Certificate");
const Cipheriv = /* @__PURE__ */ notImplementedClass("crypto.Cipheriv");
const Decipheriv = /* @__PURE__ */ notImplementedClass("crypto.Decipheriv");
const DiffieHellman = /* @__PURE__ */ notImplementedClass("crypto.DiffieHellman");
const DiffieHellmanGroup = /* @__PURE__ */ notImplementedClass("crypto.DiffieHellmanGroup");
const ECDH = /* @__PURE__ */ notImplementedClass("crypto.ECDH");
const Hash$1 = /* @__PURE__ */ notImplementedClass("crypto.Hash");
const Hmac$1 = /* @__PURE__ */ notImplementedClass("crypto.Hmac");
const KeyObject = /* @__PURE__ */ notImplementedClass("crypto.KeyObject");
const Sign = /* @__PURE__ */ notImplementedClass("crypto.Sign");
const Verify = /* @__PURE__ */ notImplementedClass("crypto.Verify");
const X509Certificate = /* @__PURE__ */ notImplementedClass("crypto.X509Certificate");
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/crypto.mjs
const constants = {
	OPENSSL_VERSION_NUMBER: 0,
	SSL_OP_ALL: 2147485776,
	SSL_OP_ALLOW_NO_DHE_KEX: 1024,
	SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION: 262144,
	SSL_OP_CIPHER_SERVER_PREFERENCE: 4194304,
	SSL_OP_CISCO_ANYCONNECT: 32768,
	SSL_OP_COOKIE_EXCHANGE: 8192,
	SSL_OP_CRYPTOPRO_TLSEXT_BUG: 2147483648,
	SSL_OP_DONT_INSERT_EMPTY_FRAGMENTS: 2048,
	SSL_OP_LEGACY_SERVER_CONNECT: 4,
	SSL_OP_NO_COMPRESSION: 131072,
	SSL_OP_NO_ENCRYPT_THEN_MAC: 524288,
	SSL_OP_NO_QUERY_MTU: 4096,
	SSL_OP_NO_RENEGOTIATION: 1073741824,
	SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION: 65536,
	SSL_OP_NO_SSLv2: 0,
	SSL_OP_NO_SSLv3: 33554432,
	SSL_OP_NO_TICKET: 16384,
	SSL_OP_NO_TLSv1: 67108864,
	SSL_OP_NO_TLSv1_1: 268435456,
	SSL_OP_NO_TLSv1_2: 134217728,
	SSL_OP_NO_TLSv1_3: 536870912,
	SSL_OP_PRIORITIZE_CHACHA: 2097152,
	SSL_OP_TLS_ROLLBACK_BUG: 8388608,
	ENGINE_METHOD_RSA: 1,
	ENGINE_METHOD_DSA: 2,
	ENGINE_METHOD_DH: 4,
	ENGINE_METHOD_RAND: 8,
	ENGINE_METHOD_EC: 2048,
	ENGINE_METHOD_CIPHERS: 64,
	ENGINE_METHOD_DIGESTS: 128,
	ENGINE_METHOD_PKEY_METHS: 512,
	ENGINE_METHOD_PKEY_ASN1_METHS: 1024,
	ENGINE_METHOD_ALL: 65535,
	ENGINE_METHOD_NONE: 0,
	DH_CHECK_P_NOT_SAFE_PRIME: 2,
	DH_CHECK_P_NOT_PRIME: 1,
	DH_UNABLE_TO_CHECK_GENERATOR: 4,
	DH_NOT_SUITABLE_GENERATOR: 8,
	RSA_PKCS1_PADDING: 1,
	RSA_NO_PADDING: 3,
	RSA_PKCS1_OAEP_PADDING: 4,
	RSA_X931_PADDING: 5,
	RSA_PKCS1_PSS_PADDING: 6,
	RSA_PSS_SALTLEN_DIGEST: -1,
	RSA_PSS_SALTLEN_MAX_SIGN: -2,
	RSA_PSS_SALTLEN_AUTO: -2,
	defaultCoreCipherList: "",
	TLS1_VERSION: 0,
	TLS1_1_VERSION: 0,
	TLS1_2_VERSION: 0,
	TLS1_3_VERSION: 0,
	POINT_CONVERSION_COMPRESSED: 2,
	POINT_CONVERSION_UNCOMPRESSED: 4,
	POINT_CONVERSION_HYBRID: 6,
	defaultCipherList: ""
};
var crypto_default$1 = {
	constants,
	getRandomValues: getRandomValues$1,
	randomUUID: randomUUID$1,
	subtle: subtle$1,
	Certificate,
	Cipher: void 0,
	Cipheriv,
	Decipher: void 0,
	Decipheriv,
	DiffieHellman,
	DiffieHellmanGroup,
	ECDH,
	Hash: Hash$1,
	Hmac: Hmac$1,
	KeyObject,
	Sign,
	Verify,
	X509Certificate,
	checkPrime,
	checkPrimeSync,
	createCipheriv,
	createDecipheriv,
	createDiffieHellman,
	createDiffieHellmanGroup,
	createECDH,
	createHash: createHash$1,
	createHmac: createHmac$1,
	createPrivateKey,
	createPublicKey,
	createSecretKey,
	createSign,
	createVerify,
	diffieHellman,
	fips: false,
	generateKey,
	generateKeyPair,
	generateKeyPairSync,
	generateKeySync,
	generatePrime,
	generatePrimeSync,
	getCipherInfo,
	getCiphers,
	getCurves,
	getDiffieHellman,
	getFips,
	getHashes: getHashes$1,
	hash: hash$1,
	hkdf,
	hkdfSync,
	pbkdf2,
	pbkdf2Sync,
	privateDecrypt,
	privateEncrypt,
	pseudoRandomBytes,
	publicDecrypt,
	prng,
	publicEncrypt,
	randomBytes: randomBytes$1,
	randomFill: randomFill$1,
	randomFillSync: randomFillSync$1,
	randomInt: randomInt$1,
	rng,
	scrypt,
	scryptSync,
	secureHeapUsed,
	setEngine,
	setFips,
	sign,
	timingSafeEqual: timingSafeEqual$1,
	verify,
	webcrypto: webcrypto$1
};
//#endregion
//#region src/node/crypto.ts
const Buffer$2 = Buffer$1;
const Transform$1 = Transform;
const web = globalThis.crypto;
const webcrypto = web;
const subtle = web.subtle;
const randomUUID = () => web.randomUUID();
const getRandomValues = (view) => web.getRandomValues(view);
const codeError = (error, code) => Object.assign(error, { code });
const invalidType = (message) => codeError(new TypeError(message), "ERR_INVALID_ARG_TYPE");
function callbackOf(callback) {
	if (typeof callback !== "function") throw invalidType("The \"callback\" argument must be of type function");
	return callback;
}
const outOfRange = (name, range, received) => codeError(/* @__PURE__ */ new RangeError(`The value of "${name}" is out of range. It must be ${range}. Received ${Math.abs(received) > 2 ** 32 ? String(received).replace(/\B(?=(\d{3})+$)/g, "_") : received}`), "ERR_OUT_OF_RANGE");
function fill(view, offset = 0, size) {
	if (!(view instanceof ArrayBuffer) && !ArrayBuffer.isView(view)) throw invalidType("The \"buf\" argument must be an instance of ArrayBuffer or ArrayBufferView");
	const element = view.BYTES_PER_ELEMENT ?? 1;
	const whole = view instanceof ArrayBuffer ? new Uint8Array(view) : new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
	const start = offset * element;
	if (!Number.isInteger(offset) || start < 0 || start > whole.length) throw outOfRange("offset", `>= 0 && <= ${whole.length}`, start);
	const end = size === void 0 ? whole.length : start + size * element;
	if (!Number.isInteger(size ?? 0) || end < start || end > whole.length) throw outOfRange("size + offset", `<= ${whole.length}`, end);
	for (let at = start; at < end; at += 65536) web.getRandomValues(whole.subarray(at, Math.min(at + 65536, end)));
	return view;
}
const randomFillSync = (view, offset, size) => fill(view, offset, size);
function randomFill(view, ...rest) {
	const callback = callbackOf(rest.pop());
	const filled = fill(view, ...rest);
	setTimeout(() => callback(null, filled));
}
function randomBytes(size, callback) {
	const done = callback === void 0 ? void 0 : callbackOf(callback);
	const bytes = fill(Buffer$2.alloc(size));
	if (!done) return bytes;
	setTimeout(() => done(null, bytes));
}
function randomInt(...args) {
	const callback = typeof args.at(-1) === "function" ? args.pop() : void 0;
	const [min, max] = args.length === 1 ? [0, args[0]] : args;
	for (const [name, value] of [["min", min], ["max", max]]) if (!Number.isSafeInteger(value)) throw invalidType(`The "${name}" argument must be a safe integer`);
	if (max <= min) throw codeError(/* @__PURE__ */ new RangeError(`The value of "max" is out of range. It must be greater than the value of "min" (${min}). Received ${max}`), "ERR_OUT_OF_RANGE");
	const range = max - min;
	if (range > 2 ** 48 - 1) throw outOfRange(args.length === 1 ? "max" : "max - min", `<= ${2 ** 48 - 1}`, range);
	const limit = 2 ** 48 - 2 ** 48 % range;
	let value;
	do
		value = web.getRandomValues(/* @__PURE__ */ new Uint8Array(6)).reduce((total, byte) => total * 256 + byte, 0);
	while (value >= limit);
	const result = min + value % range;
	if (!callback) return result;
	setTimeout(() => callback(null, result));
}
function bytesOf(data, encoding) {
	if (typeof data === "string" && encoding === "hex" && data.length % 2 === 1) throw codeError(/* @__PURE__ */ new TypeError(`The argument 'encoding' is invalid for data of length ${data.length}. Received 'hex'`), "ERR_INVALID_ARG_VALUE");
	if (typeof data === "string") return Buffer$2.from(data, encoding ?? "utf8");
	if (data instanceof ArrayBuffer) return new Uint8Array(data);
	if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	throw invalidType("The \"data\" argument must be of type string or an instance of Buffer, TypedArray, or DataView");
}
const output = (bytes, encoding) => {
	const buffer = Buffer$2.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return encoding && encoding !== "buffer" ? buffer.toString(encoding) : buffer;
};
const hashers = {
	md5,
	sha1,
	sha224,
	sha256,
	sha384,
	sha512
};
const getHashes = () => Object.keys(hashers);
function hasherOf(algorithm, use) {
	const name = String(algorithm).toLowerCase().replace(/^rsa-/, "").replace(/^sha-(1|224|256|384|512)$/, "sha$1");
	const hasher = Object.hasOwn(hashers, name) ? hashers[name] : void 0;
	if (hasher) return hasher;
	if (use === "hash") throw new Error("Digest method not supported");
	if (use === "one-shot") throw new Error(`Digest method ${algorithm} is not supported`);
	throw codeError(/* @__PURE__ */ new TypeError(`Invalid digest: ${algorithm}`), "ERR_CRYPTO_INVALID_DIGEST");
}
const finalized = () => codeError(/* @__PURE__ */ new Error("Digest already called"), "ERR_CRYPTO_HASH_FINALIZED");
var Digest = class extends Transform$1 {
	#state;
	#result;
	#digested = false;
	#again;
	constructor(state, again, options) {
		super(options);
		this.#state = state;
		this.#again = again;
	}
	#compute() {
		return this.#result ??= this.#state.digest();
	}
	get state() {
		if (this.#digested || this.#result) throw finalized();
		return this.#state;
	}
	update(data, encoding) {
		this.state.update(bytesOf(data, encoding));
		return this;
	}
	digest(encoding) {
		if (this.#digested) return output(this.#again(), encoding);
		this.#digested = true;
		return output(Uint8Array.from(this.#compute()), encoding);
	}
	_transform(chunk, _encoding, callback) {
		try {
			this.update(chunk);
		} catch (error) {
			callback(error);
			return;
		}
		callback();
	}
	_flush(callback) {
		this.push(Buffer$2.from(this.#compute()));
		callback();
	}
};
var Hash = class Hash extends Digest {
	constructor(algorithm, options) {
		if (typeof algorithm !== "string" && typeof algorithm?.clone !== "function") throw invalidType("The \"algorithm\" argument must be of type string");
		const state = typeof algorithm === "string" ? hasherOf(algorithm, "hash").create() : algorithm;
		const length = options?.outputLength;
		if (length !== void 0 && length !== state.clone().digest().length) throw codeError(/* @__PURE__ */ new Error("error:030000B2:digital envelope routines::not XOF or invalid length"), "ERR_OSSL_EVP_NOT_XOF_OR_INVALID_LENGTH");
		super(state, () => {
			throw finalized();
		}, options);
	}
	copy(options) {
		return new Hash(this.state.clone(), options);
	}
};
const createHash = (algorithm, options) => new Hash(algorithm, options);
const hash = (algorithm, data, options = "hex") => output(hasherOf(algorithm, "one-shot")(bytesOf(data)), typeof options === "string" ? options : options.outputEncoding ?? "hex");
var Hmac = class extends Digest {
	constructor(algorithm, key, options) {
		const hasher = hasherOf(algorithm, "digest");
		const secret = bytesOf(key, typeof key === "string" ? options?.encoding : void 0);
		super(hmac.create(hasher, secret), () => /* @__PURE__ */ new Uint8Array(0), options);
	}
};
const createHmac = (algorithm, key, options) => new Hmac(algorithm, key, options);
function timingSafeEqual(a, b) {
	if (a.byteLength !== b.byteLength) throw codeError(/* @__PURE__ */ new RangeError("Input buffers must have the same byte length"), "ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH");
	const left = bytesOf(a);
	const right = bytesOf(b);
	let difference = 0;
	for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
	return difference === 0;
}
var crypto_default = {
	...crypto_default$1,
	webcrypto,
	subtle,
	randomUUID,
	getRandomValues,
	randomFillSync,
	randomFill,
	randomBytes,
	randomInt,
	getHashes,
	Hash,
	createHash,
	hash,
	Hmac,
	createHmac,
	timingSafeEqual
};
//#endregion
export { Certificate, Cipher, Cipheriv, Decipher, Decipheriv, DiffieHellman, DiffieHellmanGroup, ECDH, Hash, Hmac, KeyObject, Sign, Verify, X509Certificate, checkPrime, checkPrimeSync, constants, createCipher, createCipheriv, createDecipher, createDecipheriv, createDiffieHellman, createDiffieHellmanGroup, createECDH, createHash, createHmac, createPrivateKey, createPublicKey, createSecretKey, createSign, createVerify, crypto_default as default, diffieHellman, fips, generateKey, generateKeyPair, generateKeyPairSync, generateKeySync, generatePrime, generatePrimeSync, getCipherInfo, getCiphers, getCurves, getDiffieHellman, getFips, getHashes, getRandomValues, hash, hkdf, hkdfSync, pbkdf2, pbkdf2Sync, privateDecrypt, privateEncrypt, prng, pseudoRandomBytes, publicDecrypt, publicEncrypt, randomBytes, randomFill, randomFillSync, randomInt, randomUUID, rng, scrypt, scryptSync, secureHeapUsed, setEngine, setFips, sign, subtle, timingSafeEqual, verify, webcrypto };
