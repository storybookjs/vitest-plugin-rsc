// `node:stream` for a browser: readable-stream 4, the streams of Node.js 18
// as a package, which memfs' `createReadStream()` and Next's server need to
// read and write. Not unenv's `Readable`, which reads nothing, and not
// unenv's rest, which imports `node:stream/promises`, that imports this: a
// cycle. The package has `Readable.from()`, `addAbortSignal()`,
// `compose()`, `promises` and the rest of Node's exports; the bridge to web
// streams, `Readable.toWeb()` and `fromWeb()`, is this file's, as the
// package's is for Node.js alone. `duplexPair` throws when called.

// The package's file for a browser exports `Readable`, with the rest on it:
// `Stream` is the base of Node.js, which has them all, as `node:stream` is.
import { Stream } from "readable-stream";

const {
  Readable,
  Writable,
  Duplex,
  Transform,
  PassThrough,
  finished,
  pipeline,
  promises,
  addAbortSignal,
  compose,
  destroy,
  isDisturbed,
  isErrored,
  isReadable,
  isWritable,
  isDestroyed,
  getDefaultHighWaterMark,
  setDefaultHighWaterMark,
  _isUint8Array,
  _uint8ArrayToBuffer,
} = Stream;

type NodeReadable = {
  on(event: string, listener: (...args: any[]) => void): unknown;
  destroy(reason?: unknown): unknown;
};

// The bridge of Node.js 17+. The package's own throws in a browser: it is
// made of the web streams of Node.js itself.
const readable = Readable as unknown as {
  toWeb: (readable: NodeReadable) => ReadableStream<Uint8Array>;
  fromWeb: (web: ReadableStream<Uint8Array>) => NodeReadable;
};
readable.toWeb = (source) =>
  new ReadableStream({
    start(controller) {
      source.on("data", (chunk: Uint8Array | string) =>
        controller.enqueue(
          typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk),
        ),
      );
      source.on("end", () => controller.close());
      source.on("error", (error: unknown) => controller.error(error));
    },
    cancel: (reason) => void source.destroy(reason),
  });
readable.fromWeb = (web) => {
  const reader = web.getReader();
  return new Readable({
    read() {
      reader.read().then(
        ({ done, value }) => void this.push(done ? null : Buffer.from(value)),
        (error: unknown) => this.destroy(error as Error),
      );
    },
  }) as unknown as NodeReadable;
};

// A function, not an arrow: code that extends or constructs one loads.
const missing = (name: string) =>
  function () {
    throw new Error(`vitest-plugin-rsc: stream.${name} of Node.js is not there in the browser`);
  };
export const duplexPair = missing("duplexPair");
export const _isArrayBufferView = (value: unknown): boolean => ArrayBuffer.isView(value);
// The package's bridges of a Writable and a Duplex are made of the web
// streams of Node.js too: they throw with the package's message, not that.
for (const kind of [Writable, Duplex] as unknown as Record<string, unknown>[]) {
  kind.toWeb = missing(`${(kind as { name: string }).name}.toWeb`);
  kind.fromWeb = missing(`${(kind as { name: string }).name}.fromWeb`);
}

export default Stream;
export {
  Stream,
  Readable,
  Writable,
  Duplex,
  Transform,
  PassThrough,
  finished,
  pipeline,
  promises,
  addAbortSignal,
  compose,
  destroy,
  isDisturbed,
  isErrored,
  isReadable,
  isWritable,
  isDestroyed,
  getDefaultHighWaterMark,
  setDefaultHighWaterMark,
  _isUint8Array,
  _uint8ArrayToBuffer,
};
