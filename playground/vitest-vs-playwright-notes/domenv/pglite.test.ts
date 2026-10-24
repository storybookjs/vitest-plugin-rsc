// PGlite's start as lib/__mocks__/db.ts does it, in Node.js and in the page.
import { PGlite } from "@electric-sql/pglite";
import { inject, test } from "vitest";

const env = inject("envName");
const file = (name: string) => new URL(`./pglite/${name}`, import.meta.url);

async function bytes(name: string): Promise<Uint8Array<ArrayBuffer>> {
  if (env === "browser") return new Uint8Array(await (await fetch(file(name))).arrayBuffer());
  const fs = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  return new Uint8Array(await fs.readFile(fileURLToPath(file(name)))) as Uint8Array<ArrayBuffer>;
}

test("pglite start", async () => {
  const runs = [];
  for (let i = 0; i < 2; i++) {
    const t0 = performance.now();
    let pgliteWasmModule: WebAssembly.Module, initdbWasmModule: WebAssembly.Module;
    let loadDataDir: Blob, fsBundle: Blob;
    if (env === "browser") {
      [loadDataDir, pgliteWasmModule, initdbWasmModule, fsBundle] = await Promise.all([
        fetch(file("db.tgz")).then((r) => r.blob()),
        WebAssembly.compileStreaming(fetch(file("pglite.wasm"))),
        WebAssembly.compileStreaming(fetch(file("initdb.wasm"))),
        fetch(file("pglite.data")).then((r) => r.blob()),
      ]);
    } else {
      const [d, w, iw, fsb] = await Promise.all(["db.tgz", "pglite.wasm", "initdb.wasm", "pglite.data"].map(bytes));
      const tc = performance.now();
      [pgliteWasmModule, initdbWasmModule] = await Promise.all([WebAssembly.compile(w!), WebAssembly.compile(iw!)]);
      void tc;
      loadDataDir = new Blob([d!]);
      fsBundle = new Blob([fsb!]);
    }
    const t1 = performance.now();
    const client = await PGlite.create({
      loadDataDir, pgliteWasmModule, initdbWasmModule, fsBundle,
      startParams: [...PGlite.defaultStartParams, "-c", "shared_buffers=16MB"],
    });
    const t2 = performance.now();
    await client.query("select 1");
    const t3 = performance.now();
    // a small insert/select loop, the shape of a test's queries
    const tq = performance.now();
    for (let j = 0; j < 200; j++) await client.query("select $1::int + 1 as x", [j]);
    const t4 = performance.now();
    await client.close();
    runs.push({ filesAndCompileMs: t1 - t0, createMs: t2 - t1, firstQueryMs: t3 - t2, queryUs: ((t4 - tq) / 200) * 1000 });
  }
  console.log("DOMENV_PGLITE " + JSON.stringify({ env, runs }));
}, 120_000);
