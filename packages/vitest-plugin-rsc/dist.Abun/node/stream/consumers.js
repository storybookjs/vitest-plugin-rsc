import { Buffer } from "vitest-plugin-rsc/node/buffer";
//#region src/node/stream/consumers.ts
const Buffer$1 = Buffer;
async function* chunksOf(source) {
	const stream = source;
	if (typeof source !== "object" || source === null || Symbol.asyncIterator in source || typeof stream.getReader !== "function") {
		yield* source;
		return;
	}
	const reader = stream.getReader();
	let next = await reader.read();
	while (!next.done) {
		yield next.value;
		next = await reader.read();
	}
}
const notBytes = () => Object.assign(/* @__PURE__ */ new TypeError("The \"chunk\" argument must be of type string or an instance of Buffer, TypedArray, or DataView"), { code: "ERR_INVALID_ARG_TYPE" });
async function partsOf(source) {
	const parts = [];
	for await (const chunk of chunksOf(source)) if (ArrayBuffer.isView(chunk)) parts.push(Uint8Array.from(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)));
	else if (chunk instanceof ArrayBuffer) parts.push(chunk.slice(0));
	else parts.push(chunk);
	return parts;
}
const blob = async (source) => new Blob(await partsOf(source));
const arrayBuffer = async (source) => (await blob(source)).arrayBuffer();
const buffer = async (source) => Buffer$1.from(await arrayBuffer(source));
const bytes = async (source) => new Uint8Array(await arrayBuffer(source));
async function text(source) {
	const decoder = new TextDecoder();
	let result = "";
	for await (const chunk of chunksOf(source)) if (typeof chunk === "string") result += chunk;
	else if (ArrayBuffer.isView(chunk) || chunk instanceof ArrayBuffer) result += decoder.decode(chunk, { stream: true });
	else throw notBytes();
	return result + decoder.decode();
}
const json = async (source) => JSON.parse(await text(source));
var consumers_default = {
	arrayBuffer,
	blob,
	buffer,
	bytes,
	json,
	text
};
//#endregion
export { arrayBuffer, blob, buffer, bytes, consumers_default as default, json, text };
