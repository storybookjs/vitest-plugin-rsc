// `Readable` of `node:stream`, as far as a test uses one for the body of a
// request: `next.fetch()` sends it as a stream of the web.
type Chunk = string | Uint8Array | null;

export class Readable {
  private readonly source: { read(this: Readable): unknown };
  private chunks: Chunk[] = [];

  constructor(source: { read(this: Readable): unknown }) {
    this.source = source;
  }

  push(chunk: Chunk): boolean {
    this.chunks.push(chunk);
    return true;
  }

  toWeb(): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
      pull: (controller) => {
        this.source.read.call(this);
        for (const chunk of this.chunks.splice(0)) {
          if (chunk === null) return controller.close();
          controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
        }
      },
    });
  }
}

export default { Readable };
