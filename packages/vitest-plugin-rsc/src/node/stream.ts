// `node:stream` for a browser: readable-stream 4, the streams of Node.js 18
// as a package, which memfs' `createReadStream()` and Next's server need to
// read and write. Not unenv's `Readable`, which reads nothing, and not
// unenv's rest, which imports `node:stream/promises`, that imports this: a
// cycle. The package has `Readable.from()`, `addAbortSignal()`,
// `compose()`, `promises` and the rest of Node's exports; the bridge to web
// streams, `Readable.toWeb()` and `fromWeb()`, is this file's, as the
// package's is for Node.js alone. `duplexPair()`, of Node.js 22.6, is
// this file's too.

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
// Destroyed before its end, it cancels the web stream, as Node's does.
readable.fromWeb = (web) => {
  const reader = web.getReader();
  let ended = false;
  return new Readable({
    read() {
      reader.read().then(
        ({ done, value }) => {
          ended ||= done;
          this.push(done ? null : Buffer.from(value));
        },
        (error: unknown) => {
          ended = true;
          this.destroy(error as Error);
        },
      );
    },
    destroy(error, callback) {
      if (ended) {
        callback(error);
        return;
      }
      void (async () => {
        try {
          await reader.cancel(error ?? undefined);
        } catch (cancelError) {
          callback(cancelError as Error);
          return;
        }
        callback(error);
      })();
    },
  }) as unknown as NodeReadable;
};

// A function, not an arrow: code that extends or constructs one loads.
const missing = (name: string) =>
  function () {
    throw new Error(`vitest-plugin-rsc: stream.${name} of Node.js is not there in the browser`);
  };
// Two Duplexes, each of which reads what the other is written, as the two
// ends of a socket. A write calls back once the other end reads it. One
// destroyed destroys the other, as in Node.js, and a write that waits
// calls back with the error.
type Side = {
  push(chunk: unknown): boolean;
  destroy(error?: Error): unknown;
  destroyed: boolean;
};
export function duplexPair(options?: object): [unknown, unknown] {
  const sides: Side[] = [];
  const waiting = new Map<Side, (error?: Error | null) => void>();
  const release = (side: Side, error: Error) => {
    const parked = waiting.get(side);
    waiting.delete(side);
    parked?.(error);
  };
  const sideOf = (index: number) =>
    new Duplex({
      ...options,
      read(this: Side) {
        const next = waiting.get(this);
        waiting.delete(this);
        next?.();
      },
      write(chunk: unknown, _encoding: string, callback: (error?: Error | null) => void) {
        const other = sides[1 - index]!;
        if (other.push(chunk)) callback();
        else waiting.set(other, callback);
      },
      final(callback: () => void) {
        sides[1 - index]!.push(null);
        callback();
      },
      destroy(this: Side, error: Error | null, callback: (error: Error | null) => void) {
        const other = sides[1 - index]!;
        const reason = error ?? new Error("Premature close");
        release(this, reason);
        release(other, reason);
        if (!other.destroyed) other.destroy();
        callback(error);
      },
    }) as unknown as Side;
  sides.push(sideOf(0), sideOf(1));
  return sides as [unknown, unknown];
}
export const _isArrayBufferView = (value: unknown): boolean => ArrayBuffer.isView(value);
// The package's bridges of a Writable and a Duplex are made of the web
// streams of Node.js too: they throw with the package's message, not that.
for (const kind of [Writable, Duplex] as unknown as Record<string, unknown>[]) {
  kind.toWeb = missing(`${(kind as { name: string }).name}.toWeb`);
  kind.fromWeb = missing(`${(kind as { name: string }).name}.fromWeb`);
}

// On the default export too, as in Node.js: `stream.duplexPair()`.
(Stream as unknown as Record<string, unknown>).duplexPair = duplexPair;

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
