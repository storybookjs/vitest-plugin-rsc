// `node:stream` for a browser: stream-browserify, the streams of Node.js, the
// readable-stream package, which memfs' `createReadStream()` and Next's
// server need to read and write. Not unenv's `Readable`, which reads
// nothing. With the bridge to web streams, `Readable.toWeb()` and
// `fromWeb()`, and `Readable.from()`, which readable-stream 3 does not have
// for a browser, and the rest of Node's exports: the small ones as they are
// in Node.js, the others throwing when called. Not unenv's rest, which
// imports `node:stream/promises`, that imports this: a cycle.

import Stream from "stream-browserify";

const { Readable, Writable, Duplex, Transform, PassThrough, finished, pipeline } = Stream;

type NodeStream = {
  on(event: string, listener: (...args: any[]) => void): unknown;
  destroy(reason?: unknown): unknown;
  destroyed?: boolean;
  errored?: unknown;
  readable?: boolean;
  writable?: boolean;
  readableDidRead?: boolean;
  readableAborted?: boolean;
  _readableState?: { errored?: unknown; destroyed?: boolean; dataEmitted?: boolean };
  _writableState?: { errored?: unknown; destroyed?: boolean };
};
type NodeReadable = NodeStream;

// By the bridge of Node.js 17+, which readable-stream 3 does not have.
const readable = Readable as unknown as {
  toWeb?: (readable: NodeReadable) => ReadableStream<Uint8Array>;
  fromWeb?: (web: ReadableStream<Uint8Array>) => NodeReadable;
  from: (source: unknown, options?: Record<string, unknown>) => NodeReadable;
};
readable.toWeb ??= (source) =>
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
readable.fromWeb ??= (web) => {
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

// `Readable.from()`, as Node.js has it: a chunk per item of an iterable,
// async or not, and one for a string or a Buffer. readable-stream's file
// for a browser throws for it.
readable.from = (source: unknown, options?: Record<string, unknown>) => {
  const items: Iterable<unknown> | AsyncIterable<unknown> =
    typeof source === "string" || source instanceof Uint8Array
      ? [source]
      : (source as Iterable<unknown> | AsyncIterable<unknown>);
  const iterator: AsyncIterator<unknown> | Iterator<unknown> =
    Symbol.asyncIterator in items
      ? items[Symbol.asyncIterator]()
      : (items as Iterable<unknown>)[Symbol.iterator]();
  return new Readable({
    objectMode: true,
    ...options,
    read() {
      Promise.resolve(iterator.next()).then(
        ({ done, value }) => void this.push(done ? null : value),
        (error: unknown) => this.destroy(error as Error),
      );
    },
    destroy(error, done) {
      // Closed either way: what closing it throws is not the stream's error.
      const close = () => done(error);
      void Promise.resolve(iterator.return?.()).then(close, close);
    },
  }) as unknown as NodeReadable;
};

// A function, not an arrow: code that extends or constructs one loads.
const missing = (name: string) =>
  function () {
    throw new Error(`vitest-plugin-rsc: stream.${name} of Node.js is not there in the browser`);
  };

let defaultHighWaterMark = 65536;
let defaultObjectHighWaterMark = 16;
export const getDefaultHighWaterMark = (objectMode?: boolean): number =>
  objectMode ? defaultObjectHighWaterMark : defaultHighWaterMark;
export const setDefaultHighWaterMark = (objectMode: boolean, value: number): void => {
  if (objectMode) defaultObjectHighWaterMark = value;
  else defaultHighWaterMark = value;
};
export const isDestroyed = (stream: NodeStream): boolean =>
  !!(stream.destroyed ?? stream._readableState?.destroyed ?? stream._writableState?.destroyed);
export const isErrored = (stream: NodeStream): boolean =>
  !!(stream.errored ?? stream._readableState?.errored ?? stream._writableState?.errored);
export const isReadable = (stream: NodeStream): boolean =>
  typeof stream.readable === "boolean" ? stream.readable && !isDestroyed(stream) : false;
export const isWritable = (stream: NodeStream): boolean =>
  typeof stream.writable === "boolean" ? stream.writable && !isDestroyed(stream) : false;
export const isDisturbed = (stream: NodeStream): boolean =>
  !!(stream.readableDidRead ?? stream._readableState?.dataEmitted ?? stream.readableAborted);
export const destroy = (stream: NodeStream, error?: unknown): NodeStream => {
  stream.destroy(error);
  return stream;
};
export const addAbortSignal = <T extends NodeStream>(signal: AbortSignal, stream: T): T => {
  const abort = () =>
    stream.destroy(
      Object.assign(new Error("The operation was aborted"), {
        name: "AbortError",
        code: "ABORT_ERR",
        cause: signal.reason,
      }),
    );
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  return stream;
};
export const compose = missing("compose");
export const duplexPair = missing("duplexPair");
export const _isUint8Array = (value: unknown): boolean => value instanceof Uint8Array;
export const _isArrayBufferView = (value: unknown): boolean => ArrayBuffer.isView(value);
export const _uint8ArrayToBuffer = (chunk: Uint8Array): Buffer =>
  Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);

// `stream.promises`: ./stream/promises.ts, which imports this for its
// `pipeline()` and `finished()`, inside its functions: no cycle at load.
export { default as promises } from "vitest-plugin-rsc/node/stream/promises";

export default Stream;
export { Stream, Readable, Writable, Duplex, Transform, PassThrough, finished, pipeline };
