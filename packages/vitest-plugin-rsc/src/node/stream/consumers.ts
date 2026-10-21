// `node:stream/consumers` for a browser: what a stream reads to, as Node's
// does it. A stream of Node.js, a web stream, or any async iterable of
// strings and bytes. Text is the browser's TextDecoder of the bytes as they
// come, and strings as they are; the rest is a Blob of the chunks.

import { Buffer as OwnBuffer } from "vitest-plugin-rsc/node/buffer";

// The package's own, typed as Node's: the built files have no types.
const Buffer = OwnBuffer as unknown as typeof globalThis.Buffer;

type Source = AsyncIterable<unknown> | ReadableStream<unknown>;

async function* chunksOf(source: Source): AsyncGenerator<unknown> {
  // Anything `for await` reads, as in Node.js, like an array or a string,
  // but a web stream without `Symbol.asyncIterator`, as in Safari before 18.
  const stream = source as Partial<ReadableStream<unknown>> & object;
  if (
    typeof source !== "object" ||
    source === null ||
    Symbol.asyncIterator in source ||
    typeof stream.getReader !== "function"
  ) {
    yield* source as AsyncIterable<unknown>;
    return;
  }
  const reader = stream.getReader();
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

// What `blob()` is made of, as Node's is: a Blob of the chunks, which takes
// strings, bytes and Blobs, and makes a string of anything else. The bytes
// are copied, as a stream may write its next chunk into the same buffer.
async function partsOf(source: Source): Promise<BlobPart[]> {
  const parts: BlobPart[] = [];
  for await (const chunk of chunksOf(source)) {
    if (ArrayBuffer.isView(chunk)) {
      parts.push(Uint8Array.from(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)));
    } else if (chunk instanceof ArrayBuffer) {
      parts.push(chunk.slice(0));
    } else {
      parts.push(chunk as BlobPart);
    }
  }
  return parts;
}

export const blob = async (source: Source): Promise<Blob> => new Blob(await partsOf(source));
export const arrayBuffer = async (source: Source): Promise<ArrayBuffer> =>
  (await blob(source)).arrayBuffer();
export const buffer = async (source: Source): Promise<Buffer> =>
  Buffer.from(await arrayBuffer(source));
export const bytes = async (source: Source): Promise<Uint8Array> =>
  new Uint8Array(await arrayBuffer(source));
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
