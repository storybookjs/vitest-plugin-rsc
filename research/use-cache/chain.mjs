// plugin-rsc's "use server" transform first, then Next's SWC transform on its output.
import fs from "node:fs";
import { createRequire } from "node:module";
const root = "/Users/kasperpeulen/code/github/storybookjs/vitest-plugin-rsc/.claude/worktrees/agent-af4b1127992764e28/playground/next-e2e-demo/";
const require = createRequire(root);
const { transformServerActionServer } = await import(require.resolve("@vitejs/plugin-rsc/transforms"));
const { parseAstAsync, transformWithOxc } = await import(require.resolve("vite"));
const { run } = createRequire(import.meta.url)("./swc.cjs");
for (const file of process.argv.slice(2)) {
  console.log(`\n===== ${file} =====`);
  try {
    const source = fs.readFileSync(file, "utf8");
    const { code } = await transformWithOxc(source, file, { jsx: { runtime: "automatic" } });
    const ast = await parseAstAsync(code);
    const result = transformServerActionServer(code, ast, {
      runtime: (value, name) => `$$ReactServer.registerServerReference(${value}, "/app/x.tsx", ${JSON.stringify(name)})`,
      rejectNonAsyncFunction: true,
      encode: (v) => `__vite_rsc_encryption_runtime.encryptActionBoundArgs(${v})`,
      decode: (v) => `await __vite_rsc_encryption_runtime.decryptActionBoundArgs(${v})`,
    });
    const afterRsc = result.output.toString();
    console.log("--- after plugin-rsc use-server ---\n" + afterRsc);
    const tmp = file.replace(/\.tsx?$/, ".chained.js");
    fs.writeFileSync(tmp, afterRsc);
    console.log("--- then Next SWC ---\n" + (await run(tmp)));
    fs.unlinkSync(tmp);
  } catch (e) { console.log("ERROR:", String(e.message ?? e).slice(0, 900)); }
}
process.exit(0);
