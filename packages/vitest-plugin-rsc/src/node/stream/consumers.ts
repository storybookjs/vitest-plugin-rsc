// `node:stream/consumers` for a browser: what a stream reads to, by a Blob
// of its chunks, which the browser makes text, bytes and JSON of. A stream
// of Node.js, a web stream, or any async iterable of strings and bytes.

import { Buffer as OwnBuffer } from "vitest-plugin-rsc/node/buffer";

// The package's own, typed as Node's: the built files have no types.
const Buffer = OwnBuffer as unknown as typeof globalThis.Buffer;

type Source = AsyncIterable<unknown> | ReadableStream<unknown>;

async function blobOf(source: Source): Promise<Blob> {
  const parts: BlobPart[] = [];
  // A web stream without `Symbol.asyncIterator`, as in Safari before 18.
  if (!(Symbol.asyncIterator in source)) {
    const reader = (source as ReadableStream<unknown>).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value as BlobPart);
    }
  } else {
    for await (const chunk of source as AsyncIterable<unknown>) parts.push(chunk as BlobPart);
  }
  return new Blob(parts);
}

export const blob = (source: Source): Promise<Blob> => blobOf(source);
export const arrayBuffer = async (source: Source): Promise<ArrayBuffer> =>
  (await blobOf(source)).arrayBuffer();
export const bytes = async (source: Source): Promise<Uint8Array> =>
  new Uint8Array(await arrayBuffer(source));
export const buffer = async (source: Source): Promise<Buffer> =>
  Buffer.from(await arrayBuffer(source));
export const text = async (source: Source): Promise<string> => (await blobOf(source)).text();
export const json = async (source: Source): Promise<unknown> => JSON.parse(await text(source));

export default { arrayBuffer, blob, buffer, bytes, json, text };
