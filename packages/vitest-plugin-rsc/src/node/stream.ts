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
// ends of a socket: Node's own, lib/internal/streams/duplexpair.js. A write
// calls back once the other end reads it, and an end once the other end
// has read all. One destroyed destroys the other, on the next tick, with
// no error, or ends it when it was destroyed with none.
type Side = {
  push(chunk: unknown): boolean;
  destroy(): unknown;
  destroyed: boolean;
  on(event: string, listener: () => void): unknown;
  callback: (() => void) | undefined;
};
export function duplexPair(options?: object): [unknown, unknown] {
  const sides: Side[] = [];
  const sideOf = (index: number) =>
    Object.assign(
      new Duplex({
        ...options,
        read() {
          const self = this as unknown as Side;
          const callback = self.callback;
          self.callback = undefined;
          callback?.();
        },
        write(chunk: { length: number }, _encoding: string, callback: () => void) {
          const other = sides[1 - index]!;
          if (chunk.length === 0) {
            queueMicrotask(callback);
            return;
          }
          other.push(chunk);
          other.callback = callback;
        },
        final(callback: () => void) {
          const other = sides[1 - index]!;
          other.on("end", callback);
          other.push(null);
        },
        destroy(error: Error | null, callback: (error: Error | null) => void) {
          const other = sides[1 - index]!;
          if (!other.destroyed) {
            queueMicrotask(() => {
              if (other.destroyed) return;
              if (error) other.destroy();
              else other.push(null);
            });
          }
          callback(error);
        },
      }),
      { callback: undefined },
    ) as unknown as Side;
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
