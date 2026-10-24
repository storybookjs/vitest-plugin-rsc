import assert from "vitest-plugin-rsc/node/assert";
//#region src/node/assert/strict.ts
const missing = (name) => function() {
	throw new Error(`vitest-plugin-rsc: ${name} of Node.js is not there in the browser`);
};
const own = assert.strict;
const AssertionError = own.AssertionError ?? missing("assert/strict.AssertionError");
const CallTracker = own.CallTracker ?? missing("assert/strict.CallTracker");
const strict = own.strict ?? missing("assert/strict.strict");
const fail = own.fail ?? missing("assert/strict.fail");
const ok = own.ok ?? missing("assert/strict.ok");
const throws = own.throws ?? missing("assert/strict.throws");
const rejects = own.rejects ?? missing("assert/strict.rejects");
const doesNotThrow = own.doesNotThrow ?? missing("assert/strict.doesNotThrow");
const doesNotReject = own.doesNotReject ?? missing("assert/strict.doesNotReject");
const ifError = own.ifError ?? missing("assert/strict.ifError");
const match = own.match ?? missing("assert/strict.match");
const doesNotMatch = own.doesNotMatch ?? missing("assert/strict.doesNotMatch");
const notDeepStrictEqual = own.notDeepStrictEqual ?? missing("assert/strict.notDeepStrictEqual");
const notDeepEqual = own.notDeepEqual ?? missing("assert/strict.notDeepEqual");
const strictEqual = own.strictEqual ?? missing("assert/strict.strictEqual");
const equal = own.equal ?? missing("assert/strict.equal");
const notStrictEqual = own.notStrictEqual ?? missing("assert/strict.notStrictEqual");
const notEqual = own.notEqual ?? missing("assert/strict.notEqual");
const deepStrictEqual = own.deepStrictEqual ?? missing("assert/strict.deepStrictEqual");
const deepEqual = own.deepEqual ?? missing("assert/strict.deepEqual");
const partialDeepStrictEqual = own.partialDeepStrictEqual ?? missing("assert/strict.partialDeepStrictEqual");
//#endregion
export { AssertionError, CallTracker, deepEqual, deepStrictEqual, own as default, doesNotMatch, doesNotReject, doesNotThrow, equal, fail, ifError, match, notDeepEqual, notDeepStrictEqual, notEqual, notStrictEqual, ok, partialDeepStrictEqual, rejects, strict, strictEqual, throws };
