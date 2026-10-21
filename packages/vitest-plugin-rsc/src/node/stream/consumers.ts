// `node:stream/consumers` for a browser: what a stream reads to, as Node's
// does it. A stream of Node.js, a web stream, or any async iterable of
// strings and bytes. Text is the browser's TextDecoder of the bytes as they
// come, and strings as they are; bytes are copied as they come, as a
// stream may write the next chunk into the same buffer.

import { Buffer as OwnBuffer } from "vitest-plugin-rsc/node/buffer";

// The package's own, typed as Node's: the built files have no types.
const Buffer = OwnBuffer as unknown as typeof globalThis.Buffer;

type Source = AsyncIterable<unknown> | ReadableStream<unknown>;

async function* chunksOf(source: Source): AsyncGenerator<unknown> {
  // A web stream without `Symbol.asyncIterator`, as in Safari before 18.
  if (Symbol.asyncIterator in source) {
    yield* source as AsyncIterable<unknown>;
    return;
  }
  const reader = (source as ReadableStream<unknown>).getReader();
  let next = await reader.read();
  while (!next.done) {
    yield next.value;
    next = await reader.read();
  }
}

const notBytes = () =>
  Object.assign(
    new TypeError(
      'The "chunk" argument must be of type string or an instance of Buffer, TypedArray, or DataView',
    ),
    { code: "ERR_INVALID_ARG_TYPE" },
  );
function bytesOf(chunk: unknown): Uint8Array {
  if (typeof chunk === "string") return Buffer.from(chunk);
  if (ArrayBuffer.isView(chunk)) {
    return Uint8Array.from(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
  }
  if (chunk instanceof ArrayBuffer) return Uint8Array.from(new Uint8Array(chunk));
  throw notBytes();
}

async function collect(source: Source): Promise<Uint8Array[]> {
  const parts: Uint8Array[] = [];
  for await (const chunk of chunksOf(source)) parts.push(bytesOf(chunk));
  return parts;
}

export const blob = async (source: Source): Promise<Blob> =>
  new Blob((await collect(source)) as BlobPart[]);
export const buffer = async (source: Source): Promise<Buffer> =>
  Buffer.concat(await collect(source));
export const bytes = async (source: Source): Promise<Uint8Array> =>
  new Uint8Array(await buffer(source));
export const arrayBuffer = async (source: Source): Promise<ArrayBuffer> => {
  const all = await buffer(source);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength) as ArrayBuffer;
};
export async function text(source: Source): Promise<string> {
  const decoder = new TextDecoder();
  let result = "";
  for await (const chunk of chunksOf(source)) {
    if (typeof chunk === "string") result += chunk;
    else if (ArrayBuffer.isView(chunk) || chunk instanceof ArrayBuffer) {
      result += decoder.decode(chunk as ArrayBufferView, { stream: true });
    } else throw notBytes();
  }
  return result + decoder.decode();
}
export const json = async (source: Source): Promise<unknown> => JSON.parse(await text(source));

export default { arrayBuffer, blob, buffer, bytes, json, text };
