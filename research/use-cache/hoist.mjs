// transformHoistInlineDirective (as PR #38 used it) on the same fixtures.
import fs from "node:fs";
import { createRequire } from "node:module";
const root = "/Users/kasperpeulen/code/github/storybookjs/vitest-plugin-rsc/.claude/worktrees/agent-af4b1127992764e28/playground/next-e2e-demo/";
const require = createRequire(root);
const { transformHoistInlineDirective, transformWrapExport, hasDirective } = await import(require.resolve("@vitejs/plugin-rsc/transforms"));
const { parseAstAsync, transformWithOxc } = await import(require.resolve("vite"));
for (const file of process.argv.slice(2)) {
  console.log(`\n===== ${file} =====`);
  try {
    const source = fs.readFileSync(file, "utf8");
    // As in a Vite pipeline: TypeScript and JSX are compiled first.
    const { code } = await transformWithOxc(source, file, { jsx: { runtime: "automatic" } });
    const ast = await parseAstAsync(code);
    const directive = /^use cache(?:: ([\w-]+))?$/;
    if (hasDirective(ast.body, "use cache")) {
      const result = transformWrapExport(code, ast, { runtime: (value, name) => `$$cache("default", "ID#${name}", ${value})`, rejectNonAsyncFunction: true });
      console.log("[file-level via transformWrapExport]\n" + result.output.toString());
      continue;
    }
    const result = transformHoistInlineDirective(code, ast, {
      runtime: (value, name, meta) => `$$cache(${JSON.stringify(meta.directiveMatch[1] ?? "default")}, "ID#${name}", ${value})`,
      directive, rejectNonAsyncFunction: true, noExport: true,
    });
    console.log(result.output.hasChanged() ? result.output.toString() : "(unchanged)");
  } catch (e) { console.log("ERROR:", String(e.message ?? e).slice(0, 600)); }
}
