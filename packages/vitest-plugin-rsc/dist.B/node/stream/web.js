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
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/stream/web.mjs
const ReadableStream = globalThis.ReadableStream || /* @__PURE__ */ notImplemented("stream.web.ReadableStream");
const ReadableStreamDefaultReader = globalThis.ReadableStreamDefaultReader || /* @__PURE__ */ notImplemented("stream.web.ReadableStreamDefaultReader");
const ReadableStreamBYOBReader = globalThis.ReadableStreamBYOBReader || /* @__PURE__ */ notImplemented("stream.web.ReadableStreamBYOBReader");
const ReadableStreamBYOBRequest = globalThis.ReadableStreamBYOBRequest || /* @__PURE__ */ notImplemented("stream.web.ReadableStreamBYOBRequest");
const ReadableByteStreamController = globalThis.ReadableByteStreamController || /* @__PURE__ */ notImplemented("stream.web.ReadableByteStreamController");
const ReadableStreamDefaultController = globalThis.ReadableStreamDefaultController || /* @__PURE__ */ notImplemented("stream.web.ReadableStreamDefaultController");
const TransformStream = globalThis.TransformStream || /* @__PURE__ */ notImplemented("stream.web.TransformStream");
const TransformStreamDefaultController = globalThis.TransformStreamDefaultController || /* @__PURE__ */ notImplemented("stream.web.TransformStreamDefaultController");
const WritableStream = globalThis.WritableStream || /* @__PURE__ */ notImplemented("stream.web.WritableStream");
const WritableStreamDefaultWriter = globalThis.WritableStreamDefaultWriter || /* @__PURE__ */ notImplemented("stream.web.WritableStreamDefaultWriter");
const WritableStreamDefaultController = globalThis.WritableStreamDefaultController || /* @__PURE__ */ notImplemented("stream.web.WritableStreamDefaultController");
const ByteLengthQueuingStrategy = globalThis.ByteLengthQueuingStrategy || /* @__PURE__ */ notImplemented("stream.web.ByteLengthQueuingStrategy");
const CountQueuingStrategy = globalThis.CountQueuingStrategy || /* @__PURE__ */ notImplemented("stream.web.CountQueuingStrategy");
const TextEncoderStream = globalThis.TextEncoderStream || /* @__PURE__ */ notImplemented("stream.web.TextEncoderStream");
const TextDecoderStream = globalThis.TextDecoderStream || /* @__PURE__ */ notImplemented("stream.web.TextDecoderStream");
const DecompressionStream = globalThis.DecompressionStream || /* @__PURE__ */ notImplemented("stream.web.DecompressionStream");
const CompressionStream = globalThis.DecompressionStream || /* @__PURE__ */ notImplemented("stream.web.CompressionStream");
var web_default = {
	ReadableStream,
	ReadableStreamDefaultReader,
	ReadableStreamBYOBReader,
	ReadableStreamBYOBRequest,
	ReadableByteStreamController,
	ReadableStreamDefaultController,
	TransformStream,
	TransformStreamDefaultController,
	WritableStream,
	WritableStreamDefaultWriter,
	WritableStreamDefaultController,
	ByteLengthQueuingStrategy,
	CountQueuingStrategy,
	TextEncoderStream,
	TextDecoderStream,
	DecompressionStream,
	CompressionStream
};
//#endregion
export { ByteLengthQueuingStrategy, CompressionStream, CountQueuingStrategy, DecompressionStream, ReadableByteStreamController, ReadableStream, ReadableStreamBYOBReader, ReadableStreamBYOBRequest, ReadableStreamDefaultController, ReadableStreamDefaultReader, TextDecoderStream, TextEncoderStream, TransformStream, TransformStreamDefaultController, WritableStream, WritableStreamDefaultController, WritableStreamDefaultWriter, web_default as default };
