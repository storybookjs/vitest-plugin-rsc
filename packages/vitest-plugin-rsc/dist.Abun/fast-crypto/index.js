//#region ../../node_modules/.pnpm/@noble+hashes@2.4.0/node_modules/@noble/hashes/_u64.js
const fromNumH = (n) => n / 2 ** 32 | 0;
const fromNumL = (n) => n >>> 0;
function setU64FromNum(view, byteOffset, n, isLE) {
	const h = fromNumH(n);
	const l = fromNumL(n);
	view.setUint32(byteOffset, isLE ? l : h, isLE);
	view.setUint32(byteOffset + 4, isLE ? h : l, isLE);
}
//#endregion
//#region ../../node_modules/.pnpm/@noble+hashes@2.4.0/node_modules/@noble/hashes/utils.js
/**
* Checks if something is Uint8Array. Be careful: nodejs Buffer will return true.
* @param a - value to test
* @returns `true` when the value is a Uint8Array-compatible view.
* @example
* Check whether a value is a Uint8Array-compatible view.
* ```ts
* isBytes(new Uint8Array([1, 2, 3]));
* ```
*/
function isBytes(a) {
	return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
}
const atitle = (title) => title ? `"${title}" ` : "";
/**
* Asserts something is a non-negative integer.
* @param n - number to validate
* @param title - label included in thrown errors
* @returns The validated number.
* @throws On wrong argument types. {@link TypeError}
* @throws On wrong argument ranges or values. {@link RangeError}
* @example
* Validate a non-negative integer option.
* ```ts
* anumber(32, 'length');
* ```
*/
function anumber(n, title = "") {
	if (typeof n !== "number") throw new TypeError(atitle(title) + "expected number, got " + typeof n);
	if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(atitle(title) + "expected integer >= 0, got " + n);
	return n;
}
/**
* Asserts something is Uint8Array.
* @param value - value to validate
* @param length - optional exact length constraint
* @param title - label included in thrown errors
* @returns The validated byte array.
* @throws On wrong argument types. {@link TypeError}
* @throws On wrong argument ranges or values. {@link RangeError}
* @example
* Validate that a value is a byte array.
* ```ts
* abytes(new Uint8Array([1, 2, 3]));
* ```
*/
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
const aobject = (value, label) => {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError((label === "object" ? "" : `"${label}" `) + "expected object, got type=" + typeof value);
};
const aopts = (value, label) => {
	aobject(value, label);
	const proto = Object.getPrototypeOf(value);
	if (proto !== Object.prototype && proto !== null) throw new TypeError(`"${label}" expected plain object`);
	if (Object.hasOwn(value, "__proto__")) throw new TypeError(`"${label}.__proto__" is not allowed`);
};
/**
* Asserts a hash instance has not been destroyed or finished.
* @param instance - hash instance to validate
* @param checkFinished - whether to reject finalized instances
* @throws If the hash instance has already been destroyed or finalized. {@link Error}
* @example
* Validate that a hash instance is still usable.
* ```ts
* import { aexists } from '@noble/hashes/utils.js';
* import { sha256 } from '@noble/hashes/sha2.js';
* const hash = sha256.create();
* aexists(hash);
* ```
*/
function aexists(instance, checkFinished = true) {
	if (instance.destroyed) throw new Error("hash was destroyed");
	if (checkFinished && instance.finished) throw new Error("digest() was already called");
}
/**
* Asserts output is a sufficiently-sized byte array.
* @param out - destination buffer
* @param instance - hash instance providing output length
* Oversized buffers are allowed; downstream code only promises to fill the first `outputLen` bytes.
* @throws On wrong argument types. {@link TypeError}
* @throws On wrong argument ranges or values. {@link RangeError}
* @example
* Validate a caller-provided digest buffer.
* ```ts
* import { aoutput } from '@noble/hashes/utils.js';
* import { sha256 } from '@noble/hashes/sha2.js';
* const hash = sha256.create();
* aoutput(new Uint8Array(hash.outputLen), hash);
* ```
*/
function aoutput(out, instance) {
	abytes(out, void 0, "output");
	const min = instance.outputLen;
	if (!(out.length >= min)) throw new RangeError("\"output\" expected length >= " + min);
}
/**
* Zeroizes typed arrays in place. Warning: JS provides no guarantees.
* @param arrays - arrays to overwrite with zeros
* @example
* Zeroize sensitive buffers in place.
* ```ts
* clean(new Uint8Array([1, 2, 3]));
* ```
*/
function clean(...arrays) {
	for (let i = 0; i < arrays.length; i++) arrays[i].fill(0);
}
/**
* Creates a DataView for byte-level manipulation.
* @param arr - source typed array
* @returns DataView over the same buffer region.
* @example
* Create a DataView over an existing buffer.
* ```ts
* createView(new Uint8Array(4));
* ```
*/
function createView(arr) {
	return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
/**
* Rotate-right operation for uint32 values.
* @param word - source word
* @param shift - shift amount in bits
* @returns Rotated word.
* @example
* Rotate a 32-bit word to the right.
* ```ts
* rotr(0x12345678, 8);
* ```
*/
function rotr(word, shift) {
	return word << 32 - shift | word >>> shift;
}
/**
* Merges default options and passed options.
* @param defaults - base option object
* @param opts - user overrides
* @param title - label included in thrown override errors
* @returns Fresh merged option object with a null prototype.
* @throws On wrong argument types. {@link TypeError}
* @example
* Merge user overrides onto default options.
* ```ts
* checkOpts({ dkLen: 32 }, { asyncTick: 10 });
* ```
*/
function checkOpts(defaults, opts, title = "opts") {
	aopts(defaults, "defaults");
	if (opts !== void 0) aopts(opts, title);
	return Object.assign(Object.create(null), defaults, opts);
}
/**
* Creates a callable hash function from a stateful class constructor.
* @param hashCons - hash constructor or factory
* @param info - optional metadata such as DER OID
* @returns Frozen callable hash wrapper with `.create()`.
*   Wrapper construction eagerly calls `hashCons(undefined)` once to read
*   `outputLen` / `blockLen`, so constructor side effects happen at module
*   init time.
* @throws On wrong argument types. {@link TypeError}
* @example
* Wrap a stateful hash constructor into a callable helper.
* ```ts
* import { createHasher } from '@noble/hashes/utils.js';
* import { sha256 } from '@noble/hashes/sha2.js';
* const wrapped = createHasher(sha256.create, { oid: sha256.oid });
* wrapped(new Uint8Array([1]));
* ```
*/
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
/**
* Creates OID metadata for NIST hashes with prefix `06 09 60 86 48 01 65 03 04 02`.
* @param suffix - final OID byte for the selected hash.
*   The helper accepts any byte even though only the documented NIST hash
*   suffixes are meaningful downstream.
* @returns Object containing the DER-encoded OID.
* @example
* Build OID metadata for a NIST hash.
* ```ts
* oidNist(0x01);
* ```
*/
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
//#region ../../node_modules/.pnpm/@noble+hashes@2.4.0/node_modules/@noble/hashes/_md.js
/**
* Internal Merkle-Damgard hash utils.
* @module
*/
/**
* Shared 32-bit conditional boolean primitive reused by SHA-256, SHA-1, and MD5 `F`.
* Returns bits from `b` when `a` is set, otherwise from `c`.
* The XOR form is equivalent to MD5's `F(X,Y,Z) = XY v not(X)Z` because the masked terms never
* set the same bit.
* @param a - selector word
* @param b - word chosen when selector bit is set
* @param c - word chosen when selector bit is clear
* @returns Mixed 32-bit word.
* @example
* Combine three words with the shared 32-bit choice primitive.
* ```ts
* Chi(0xffffffff, 0x12345678, 0x87654321);
* ```
*/
function Chi(a, b, c) {
	return a & b ^ ~a & c;
}
/**
* Shared 32-bit majority primitive reused by SHA-256 and SHA-1.
* Returns bits shared by at least two inputs.
* @param a - first input word
* @param b - second input word
* @param c - third input word
* @returns Mixed 32-bit word.
* @example
* Combine three words with the shared 32-bit majority primitive.
* ```ts
* Maj(0xffffffff, 0x12345678, 0x87654321);
* ```
*/
function Maj(a, b, c) {
	return a & b ^ a & c ^ b & c;
}
/**
* Merkle-Damgard hash construction base class.
* Could be used to create MD5, RIPEMD, SHA1, SHA2.
* Accepts only byte-aligned `Uint8Array` input, even when the underlying spec describes bit
* strings with partial-byte tails.
* @param blockLen - internal block size in bytes
* @param outputLen - digest size in bytes
* @param padOffset - trailing length field size in bytes
* @param isLE - whether length and state words are encoded in little-endian
* @example
* Use a concrete subclass to get the shared Merkle-Damgard update/digest flow.
* ```ts
* import { _SHA1 } from '@noble/hashes/legacy.js';
* const hash = new _SHA1();
* hash.update(new Uint8Array([97, 98, 99]));
* hash.digest();
* ```
*/
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
/**
* Initial SHA-2 state: fractional parts of square roots of first 16 primes 2..53.
* Check out `test/misc/sha2-gen-iv.js` for recomputation guide.
*/
/** Initial SHA256 state from RFC 6234 §6.1: the first 32 bits of the fractional parts of the
* square roots of the first eight prime numbers. Exported as a shared table; callers must treat
* it as read-only because constructors copy words from it by index. */
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
//#endregion
//#region ../../node_modules/.pnpm/@noble+hashes@2.4.0/node_modules/@noble/hashes/sha2.js
/**
* SHA2 hash function. A.k.a. sha256, sha384, sha512, sha512_224, sha512_256.
* SHA256 is the fastest hash implementable in JS, even faster than Blake3.
* Check out {@link https://www.rfc-editor.org/rfc/rfc4634 | RFC 4634} and
* {@link https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf | FIPS 180-4}.
* @module
*/
/**
* SHA-224 / SHA-256 round constants from RFC 6234 §5.1: the first 32 bits
* of the cube roots of the first 64 primes (2..311).
*/
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
/** Reusable SHA-224 / SHA-256 message schedule buffer `W_t` from RFC 6234 §6.2 step 1. */
const SHA256_W = /* @__PURE__ */ new Uint32Array(64);
/** Internal SHA-224 / SHA-256 compression engine from RFC 6234 §6.2. */
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
/** Internal SHA-256 hash class grounded in RFC 6234 §6.2. */
var _SHA256 = class extends SHA2_32B {
	constructor() {
		super(32, SHA256_IV);
	}
};
/**
* SHA2-256 hash function from RFC 4634. In JS it's the fastest: even faster than Blake3. Some info:
*
* - Trying 2^128 hashes would get 50% chance of collision, using birthday attack.
* - BTC network is doing 2^70 hashes/sec (2^95 hashes/year) as per 2025.
* - Each sha256 hash is executing 2^18 bit operations.
* - Good 2024 ASICs can do 200Th/sec with 3500 watts of power, corresponding to 2^36 hashes/joule.
* @param msg - message bytes to hash
* @param opts - Reserved hash options.
* @returns Digest bytes.
* @example
* Hash a message with SHA2-256.
* ```ts
* sha256(new Uint8Array([97, 98, 99]));
* ```
*/
const sha256 = /* @__PURE__ */ createHasher(() => new _SHA256(), /* @__PURE__ */ oidNist(1));
//#endregion
//#region src/fast-crypto/index.ts
const encoder = new TextEncoder();
function bytesOf(input) {
	if (typeof input === "string") return encoder.encode(input);
	if (input instanceof ArrayBuffer) return new Uint8Array(input);
	if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
	return encoder.encode(String(input));
}
const lengthOf = (count) => new Uint8Array(new Uint32Array([count]).buffer);
/**
* `length` bytes of one SHA-256 over `algorithm` and every input, each with
* its length before it, so that no two lists of inputs run together the
* same. Longer than 32 bytes by SHA-256 of that digest and a counter.
*/
function derive(algorithm, inputs, length) {
	const hash = sha256.create().update(encoder.encode(algorithm));
	for (const input of inputs) {
		const bytes = bytesOf(input);
		hash.update(lengthOf(bytes.length)).update(bytes);
	}
	const seed = hash.digest();
	const output = new Uint8Array(length);
	for (let block = 0; block * 32 < length; block++) {
		const next = sha256.create().update(seed).update(lengthOf(block)).digest();
		output.set(next.subarray(0, length - block * 32), block * 32);
	}
	return output;
}
/** The error of a hash that the stand-in did not make. */
function notMadeHere(api, hash) {
	return /* @__PURE__ */ new Error(`vitest-plugin-rsc: \`fast.crypto\` stands in for ${api}, which got a hash it did not make: ${JSON.stringify(hash.slice(0, 32))}... A hash made by the real algorithm, like one of a fixture, does not verify under the stand-in. Make the hash in the test, with the app's own function, or run the test with \`fast: { crypto: false }\`.`);
}
const callLater = (call) => queueMicrotask(call);
const bcryptAlphabet = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function bcryptBase64(bytes, length = bytes.length) {
	let text = "";
	for (let at = 0; at < length; at += 3) {
		const [a = 0, b = 0, c = 0] = [
			bytes[at],
			bytes[at + 1],
			bytes[at + 2]
		];
		text += bcryptAlphabet[a >> 2] + bcryptAlphabet[(a & 3) << 4 | b >> 4];
		if (at + 1 < length) text += bcryptAlphabet[(b & 15) << 2 | c >> 6];
		if (at + 2 < length) text += bcryptAlphabet[c & 63];
	}
	return text;
}
function bcryptBytes(text, length) {
	const values = text.split("").map((char) => bcryptAlphabet.indexOf(char));
	const bytes = [];
	for (let at = 0; at + 1 < values.length && bytes.length < length; at += 4) {
		const [a, b, c = 0, d = 0] = values.slice(at, at + 4);
		bytes.push((a << 2 | b >> 4) & 255);
		if (at + 2 < values.length) bytes.push((b << 4 | c >> 2) & 255);
		if (at + 3 < values.length) bytes.push((c << 6 | d) & 255);
	}
	return bytes.slice(0, length);
}
const bcryptMark = "fastHash";
const bcryptSalt = /^\$2[abxy]\$(\d\d)\$[./A-Za-z0-9]{22}$/;
function bcryptSaltOf(rounds = 10, minor = "b") {
	const cost = Math.min(31, Math.max(4, rounds));
	const random = crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(16));
	return `$2${minor}$${String(cost).padStart(2, "0")}$${bcryptBase64(random)}`;
}
function bcryptHash(password, salt) {
	if (!bcryptSalt.test(salt)) throw new Error(`Invalid salt: ${salt}`);
	const digest = derive("bcrypt", [encoder.encode(password).subarray(0, 72), salt], 18);
	return salt + bcryptMark + bcryptBase64(digest).slice(0, 23);
}
function bcryptVerify(api, password, hash) {
	if (hash.length !== 60) return false;
	if (hash.slice(29, 37) !== bcryptMark) throw notMadeHere(api, hash);
	return bcryptHash(password, hash.slice(0, 29)) === hash;
}
function withCallback(callback, work) {
	if (typeof callback !== "function") return new Promise((resolve, reject) => callLater(() => {
		try {
			resolve(work());
		} catch (error) {
			reject(error);
		}
	}));
	callLater(() => {
		let result;
		try {
			result = work();
		} catch (error) {
			callback(error);
			return;
		}
		callback(null, result);
	});
}
const roundsOrSalt = (salt) => typeof salt === "number" ? bcryptSaltOf(salt) : salt === void 0 ? bcryptSaltOf() : String(salt);
const lastFunction = (args) => args.findLast((arg) => typeof arg === "function");
/** bcryptjs, and bcrypt, the native package, which has the same API. */
function bcrypt(api = "bcryptjs") {
	const genSaltSync = (rounds, minor) => bcryptSaltOf(rounds, typeof minor === "string" ? minor : "b");
	const hashSync = (password, salt) => {
		if (typeof password !== "string") throw new Error(`Illegal arguments: ${typeof password}`);
		return bcryptHash(password, roundsOrSalt(salt));
	};
	const compareSync = (password, hash) => {
		if (typeof password !== "string" || typeof hash !== "string") throw new Error(`Illegal arguments: ${typeof password}, ${typeof hash}`);
		return bcryptVerify(`${api}.compare()`, password, hash);
	};
	return {
		genSaltSync,
		genSalt: (...args) => withCallback(lastFunction(args), () => genSaltSync(typeof args[0] === "number" ? args[0] : void 0, args[1])),
		hashSync,
		hash: (password, salt, callback) => withCallback(callback, () => hashSync(password, salt)),
		compareSync,
		compare: (password, hash, callback) => withCallback(callback, () => compareSync(password, hash)),
		getRounds: (hash) => parseInt(hash.split("$")[2], 10),
		getSalt: (hash) => {
			if (hash.length !== 60) throw new Error(`Illegal hash length: ${hash.length} != 60`);
			return hash.slice(0, 29);
		},
		truncates: (password) => encoder.encode(password).length > 72,
		encodeBase64: (bytes, length) => bcryptBase64(bytes, length),
		decodeBase64: (text, length) => bcryptBytes(text, length),
		setRandomFallback: () => {}
	};
}
/** @node-rs/bcrypt: `verify()` for `compare()`, and promises only. */
function nodeRsBcrypt() {
	const api = "@node-rs/bcrypt's verify()";
	const genSaltSync = (rounds = 12, version = "2b") => bcryptSaltOf(rounds, version.replace(/^2/, ""));
	const hashSync = (password, cost = 12, salt) => {
		return bcryptHash(typeof password === "string" ? password : new TextDecoder().decode(password), salt ? `$2b$${String(cost).padStart(2, "0")}$${bcryptBase64(salt, 16)}` : bcryptSaltOf(cost));
	};
	const verifySync = (password, hash) => bcryptVerify(api, typeof password === "string" ? password : new TextDecoder().decode(password), hash);
	const later = (work) => withCallback(void 0, work);
	return {
		DEFAULT_COST: 12,
		genSaltSync,
		genSalt: (rounds, version) => later(() => genSaltSync(rounds, version)),
		hashSync,
		hash: (password, cost, salt) => later(() => hashSync(password, cost, salt)),
		verifySync,
		verify: (password, hash) => later(() => verifySync(password, hash)),
		compareSync: verifySync,
		compare: (password, hash) => later(() => verifySync(password, hash))
	};
}
const argon2Types = [
	"argon2d",
	"argon2i",
	"argon2id"
];
const argon2Mark = Uint8Array.from(atob("fastHash"), (char) => char.charCodeAt(0));
const base64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/=+$/, "");
const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
function argon2Raw(password, salt, params) {
	const { type, version, memory, passes, parallelism, length, secret, associatedData } = params;
	const digest = derive(argon2Types[type] ?? "argon2", [
		password,
		salt,
		version,
		memory,
		passes,
		parallelism,
		secret,
		associatedData
	], length);
	if (length >= argon2Mark.length + 16) digest.set(argon2Mark);
	return digest;
}
function argon2Encoded(salt, hash, params) {
	const { type, version, memory, passes, parallelism } = params;
	return `$${argon2Types[type]}$v=${version}$m=${memory},t=${passes},p=${parallelism}$${base64(salt)}$${base64(hash)}`;
}
const phc = /^\$(argon2(?:d|i|id))\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;
function argon2Verify(api, encoded, password, secret) {
	const match = phc.exec(encoded);
	if (!match) throw new Error(`Invalid hash: ${encoded}`);
	const [, name, version, memory, passes, parallelism, salt, hash] = match;
	const expected = fromBase64(hash);
	if (expected.length < argon2Mark.length + 16) return false;
	if (!argon2Mark.every((byte, at) => expected[at] === byte)) throw notMadeHere(api, encoded);
	const params = {
		type: argon2Types.indexOf(name),
		version: Number(version),
		memory: Number(memory),
		passes: Number(passes),
		parallelism: Number(parallelism),
		length: expected.length,
		secret
	};
	return base64(argon2Raw(password, fromBase64(salt), params)) === hash;
}
/** argon2, the native package: Argon2id at OWASP's minimum by default. */
function argon2() {
	const paramsOf = (options = {}) => ({
		type: options.type ?? 2,
		version: options.version ?? 19,
		memory: options.memoryCost ?? 65536,
		passes: options.timeCost ?? 3,
		parallelism: options.parallelism ?? 4,
		length: options.hashLength ?? 32,
		secret: options.secret,
		associatedData: options.associatedData
	});
	return {
		argon2d: 0,
		argon2i: 1,
		argon2id: 2,
		hash: async (password, options = {}) => {
			const params = paramsOf(options);
			const salt = options.salt ?? crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(16));
			const hash = argon2Raw(password, salt, params);
			return options.raw ? hash : argon2Encoded(salt, hash, params);
		},
		verify: async (digest, password, options = {}) => argon2Verify("argon2's verify()", digest, password, options.secret),
		needsRehash: (digest, options = {}) => {
			const match = phc.exec(digest);
			const params = paramsOf(options);
			return !match || Number(match[2]) !== params.version || Number(match[3]) !== params.memory || Number(match[4]) !== params.passes;
		}
	};
}
/** @node-rs/argon2: Argon2id with 19 MiB, 2 passes and 1 lane by default. */
function nodeRsArgon2() {
	const paramsOf = (options = {}) => ({
		type: options.algorithm ?? 2,
		version: options.version === 0 ? 16 : 19,
		memory: options.memoryCost ?? 19456,
		passes: options.timeCost ?? 2,
		parallelism: options.parallelism ?? 1,
		length: options.outputLen ?? 32,
		secret: options.secret
	});
	const hashRawSync = (password, options) => argon2Raw(password, options?.salt ?? crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(16)), paramsOf(options));
	const hashSync = (password, options) => {
		const params = paramsOf(options);
		const salt = options?.salt ?? crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(16));
		return argon2Encoded(salt, argon2Raw(password, salt, params), params);
	};
	const verifySync = (hashed, password, options) => argon2Verify("@node-rs/argon2's verify()", hashed, password, options?.secret);
	return {
		Algorithm: {
			Argon2d: 0,
			Argon2i: 1,
			Argon2id: 2,
			0: "Argon2d",
			1: "Argon2i",
			2: "Argon2id"
		},
		Version: {
			V0x10: 0,
			V0x13: 1,
			0: "V0x10",
			1: "V0x13"
		},
		hashSync,
		hash: async (password, options) => hashSync(password, options),
		hashRawSync,
		hashRaw: async (password, options) => hashRawSync(password, options),
		verifySync,
		verify: async (hashed, password, options) => verifySync(hashed, password, options)
	};
}
const positive = (name, value) => {
	if (!Number.isSafeInteger(value) || value < 1) throw new Error(`"${name}" expected integer >= 1, got ${String(value)}`);
	return value;
};
/** @noble/hashes/scrypt.js, which Better Auth hashes its passwords with. */
function nobleScrypt() {
	const scrypt = (password, salt, opts) => {
		const N = positive("N", opts.N);
		if (N < 2 || (N & N - 1) !== 0) throw new Error("\"N\" expected a power of 2, and 2 or more");
		return derive("scrypt", [
			password,
			salt,
			...[
				N,
				positive("r", opts.r),
				positive("p", opts.p)
			]
		], positive("dkLen", opts.dkLen ?? 32));
	};
	return {
		scrypt,
		scryptAsync: async (...args) => scrypt(...args)
	};
}
function noblePbkdf2() {
	const pbkdf2 = (hash, password, salt, opts) => derive("pbkdf2", [
		password,
		salt,
		positive("c", opts.c),
		hash.outputLen,
		hash.blockLen
	], positive("dkLen", opts.dkLen ?? hash.outputLen));
	return {
		pbkdf2,
		pbkdf2Async: async (...args) => pbkdf2(...args)
	};
}
function nobleArgon2() {
	const of = (type) => (password, salt, opts) => argon2Raw(password, salt, {
		type,
		version: opts.version ?? 19,
		memory: positive("m", opts.m),
		passes: positive("t", opts.t),
		parallelism: positive("p", opts.p),
		length: positive("dkLen", opts.dkLen ?? 32),
		secret: opts.key,
		associatedData: opts.personalization
	});
	const later = (call) => async (...args) => call(...args);
	const [argon2d, argon2i, argon2id] = [
		of(0),
		of(1),
		of(2)
	];
	return {
		argon2d,
		argon2i,
		argon2id,
		argon2dAsync: later(argon2d),
		argon2iAsync: later(argon2i),
		argon2idAsync: later(argon2id)
	};
}
const codeError = (error, code) => Object.assign(error, { code });
const nodeInteger = (name, value, min, max = 2 ** 31 - 1) => {
	if (typeof value !== "number") throw codeError(/* @__PURE__ */ new TypeError(`The "${name}" argument must be of type number. Received ${typeof value}`), "ERR_INVALID_ARG_TYPE");
	if (!Number.isInteger(value) || value < min || value > max) throw codeError(/* @__PURE__ */ new RangeError(`The value of "${name}" is out of range. It must be >= ${min} && <= ${max}. Received ${value}`), "ERR_OUT_OF_RANGE");
	return value;
};
const nodeCallback = (callback) => {
	if (typeof callback !== "function") throw codeError(/* @__PURE__ */ new TypeError("The \"callback\" argument must be of type function"), "ERR_INVALID_ARG_TYPE");
	return callback;
};
const nodeDigests = new Set(`
  rsa-md5 rsa-ripemd160 rsa-sha1 rsa-sha1-2 rsa-sha224 rsa-sha256 rsa-sha3-224 rsa-sha3-256
  rsa-sha3-384 rsa-sha3-512 rsa-sha384 rsa-sha512 rsa-sha512/224 rsa-sha512/256 rsa-sm3
  blake2b-512 blake2b512 blake2s-256 blake2s256 id-rsassa-pkcs1-v1_5-with-sha3-224
  id-rsassa-pkcs1-v1_5-with-sha3-256 id-rsassa-pkcs1-v1_5-with-sha3-384
  id-rsassa-pkcs1-v1_5-with-sha3-512 keccak-224 keccak-256 keccak-384 keccak-512 md5 md5-sha1
  md5withrsaencryption ripemd ripemd-160 ripemd160 ripemd160withrsa rmd160 sha-1 sha-224 sha-256
  sha-256/192 sha-384 sha-512 sha-512/224 sha-512/256 sha1 sha1withrsaencryption sha2-224
  sha2-256 sha2-256/192 sha2-384 sha2-512 sha2-512/224 sha2-512/256 sha224
  sha224withrsaencryption sha256 sha256-192 sha256withrsaencryption sha3-224 sha3-256 sha3-384
  sha3-512 sha384 sha384withrsaencryption sha512 sha512-224 sha512-224withrsaencryption
  sha512-256 sha512-256withrsaencryption sha512withrsaencryption sm3 sm3withrsaencryption
  ssl3-md5 ssl3-sha1
`.trim().split(/\s+/));
/**
* `pbkdf2`, `scrypt` and `argon2` of `node:crypto`, sync and with a
* callback, each a `Buffer` as Node's: `Buffer` is the layer's.
*/
function nodeCrypto(Buffer) {
	const buffer = (bytes) => Buffer.from(bytes.buffer);
	const pbkdf2Sync = (password, salt, iterations, keylen, digest) => {
		nodeInteger("iterations", iterations, 1);
		nodeInteger("keylen", keylen, 0);
		if (typeof digest !== "string") throw codeError(/* @__PURE__ */ new TypeError(`The "digest" argument must be of type string. Received ${typeof digest}`), "ERR_INVALID_ARG_TYPE");
		if (!nodeDigests.has(digest.toLowerCase())) throw codeError(/* @__PURE__ */ new TypeError(`Invalid digest: ${digest}`), "ERR_CRYPTO_INVALID_DIGEST");
		if (keylen === 0) throw new Error("Deriving bits failed");
		return buffer(derive("pbkdf2", [
			password,
			salt,
			iterations,
			digest.toLowerCase()
		], keylen));
	};
	const scryptSync = (password, salt, keylen, options = {}) => {
		nodeInteger("keylen", keylen, 0);
		const N = options.N ?? options.cost ?? 16384;
		const r = options.r ?? options.blockSize ?? 8;
		const p = options.p ?? options.parallelization ?? 1;
		const maxmem = options.maxmem ?? 33554432;
		if (N < 2 || (N & N - 1) !== 0 || r < 1 || p < 1 || 128 * r * (N + 2 + p) > maxmem) throw codeError(/* @__PURE__ */ new RangeError("Invalid scrypt params: memory limit exceeded or invalid parameters"), "ERR_CRYPTO_INVALID_SCRYPT_PARAMS");
		return buffer(derive("scrypt", [
			password,
			salt,
			N,
			r,
			p
		], keylen));
	};
	const argon2Sync = (algorithm, parameters) => {
		if (argon2Types.indexOf(algorithm) < 0) throw codeError(/* @__PURE__ */ new TypeError(`The argument 'algorithm' must be one of: 'argon2d', 'argon2i', 'argon2id'. Received '${algorithm}'`), "ERR_INVALID_ARG_VALUE");
		const { message, nonce, parallelism, tagLength, memory, passes } = parameters;
		if (bytesOf(nonce).length < 8) throw codeError(/* @__PURE__ */ new RangeError("The \"parameters.nonce.byteLength\" is out of range. It must be >= 8."), "ERR_OUT_OF_RANGE");
		nodeInteger("parameters.parallelism", parallelism, 1, 2 ** 24 - 1);
		nodeInteger("parameters.tagLength", tagLength, 4);
		nodeInteger("parameters.memory", memory, 8 * parallelism);
		nodeInteger("parameters.passes", passes, 1);
		return buffer(derive(algorithm, [
			message,
			nonce,
			19,
			memory,
			passes,
			parallelism,
			parameters.secret,
			parameters.associatedData
		], tagLength));
	};
	return {
		pbkdf2Sync,
		pbkdf2(...args) {
			const callback = nodeCallback(args[5]);
			const key = pbkdf2Sync(...args.slice(0, 5));
			callLater(() => callback(null, key));
		},
		scryptSync,
		scrypt(...args) {
			const callback = nodeCallback(args.pop());
			const key = scryptSync(...args);
			callLater(() => callback(null, key));
		},
		argon2Sync,
		argon2(algorithm, parameters, callback) {
			const done = nodeCallback(callback);
			const key = argon2Sync(algorithm, parameters);
			callLater(() => done(null, key));
		}
	};
}
const installed = /* @__PURE__ */ new WeakSet();
const nameOf = (algorithm) => (typeof algorithm === "string" ? algorithm : algorithm.name).toUpperCase();
function keyBits(type) {
	if (typeof type === "string") return void 0;
	const name = nameOf(type);
	if (name.startsWith("AES-")) return "length" in type ? type.length : void 0;
	if (name !== "HMAC") return void 0;
	if ("length" in type && type.length) return type.length;
	return {
		"SHA-1": 512,
		"SHA-256": 512,
		"SHA-384": 1024,
		"SHA-512": 1024
	}["hash" in type && type.hash ? nameOf(type.hash) : ""];
}
/**
* Makes PBKDF2 of `subtle` a stand-in: `deriveBits()` and `deriveKey()` of a
* key that `importKey()` imported for it, whose bytes it keeps for that. The
* page's own `crypto.subtle` by default, which the app and the tests share.
* Any other algorithm, and a call that Web Crypto would reject, are the
* browser's own.
*/
function installWebCrypto(subtle = globalThis.crypto.subtle) {
	if (installed.has(subtle)) return;
	installed.add(subtle);
	const original = {
		importKey: subtle.importKey,
		deriveBits: subtle.deriveBits,
		deriveKey: subtle.deriveKey
	};
	const passwords = /* @__PURE__ */ new WeakMap();
	function pbkdf2Of(params, key, bits, usage) {
		if (typeof params !== "object" || !params || nameOf(params) !== "PBKDF2") return;
		const password = passwords.get(key);
		const { salt, iterations, hash } = params;
		if (!password || !key.usages.includes(usage) || !bits || bits % 8 !== 0) return;
		if (!Number.isInteger(iterations) || iterations < 1 || !salt) return;
		return derive("PBKDF2", [
			password,
			salt,
			iterations,
			nameOf(hash)
		], bits / 8);
	}
	Object.assign(subtle, {
		async importKey(...args) {
			const key = await original.importKey.apply(this, args);
			const [format, data, algorithm] = args;
			if (format === "raw" && nameOf(algorithm) === "PBKDF2") passwords.set(key, bytesOf(data).slice());
			return key;
		},
		async deriveBits(algorithm, baseKey, length) {
			const bits = pbkdf2Of(algorithm, baseKey, length, "deriveBits");
			if (bits) return bits.buffer;
			return original.deriveBits.call(this, algorithm, baseKey, length);
		},
		async deriveKey(algorithm, baseKey, derivedKeyType, extractable, keyUsages) {
			const bits = pbkdf2Of(algorithm, baseKey, keyBits(derivedKeyType), "deriveKey");
			if (bits) return original.importKey.call(this, "raw", bits, derivedKeyType, extractable, keyUsages);
			return original.deriveKey.call(this, algorithm, baseKey, derivedKeyType, extractable, keyUsages);
		}
	});
}
//#endregion
export { argon2, bcrypt, derive, installWebCrypto, nobleArgon2, noblePbkdf2, nobleScrypt, nodeCrypto, nodeRsArgon2, nodeRsBcrypt, notMadeHere };
