// Next's SWC transform with only the server-actions pass, on JavaScript that Vite has already compiled.
const path = require("node:path"); const fs = require("node:fs");
const nextDir = fs.realpathSync("/tmp/next164");
const swc = require(path.join(nextDir, "dist/build/swc/index.js"));
(async () => {
  const { transformWithOxc, parseAstAsync } = await import(require.resolve("vite", { paths: ["/Users/kasperpeulen/code/github/storybookjs/vitest-plugin-rsc/.claude/worktrees/agent-af4b1127992764e28/playground/next-e2e-demo/"] }));
  await swc.loadBindings();
  for (const file of process.argv.slice(2)) {
    console.log(`\n===== ${file} =====`);
    try {
      let { code } = await transformWithOxc(fs.readFileSync(file, "utf8"), file, { jsx: { runtime: "automatic" } });
      if (process.env.STRIP) code = code.replace(/^(\s*)(["'])use server\2;?/gm, "$1");
      const t0 = performance.now();
      const out = await swc.transform(code, {
        filename: path.resolve(file), sourceMaps: true, isModule: true,
        jsc: { parser: { syntax: "ecmascript" }, target: "esnext" },
        serverActions: { isReactServerLayer: true, isDevelopment: false, useCacheEnabled: process.env.OFF ? false : true, hashSalt: "", cacheKinds: ["default", "remote", "private", "custom"] },
      });
      console.log(out.code, `\n// ${(performance.now() - t0).toFixed(1)} ms, map: ${out.map ? "yes" : "no"}`);
    } catch (e) { console.log("ERROR:", String(e.message ?? e).slice(0, 700)); }
  }
  process.exit(0);
})();
