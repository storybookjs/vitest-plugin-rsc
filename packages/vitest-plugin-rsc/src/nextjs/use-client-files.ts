import { readFile } from "node:fs/promises";
import { hasDirective } from "@vitejs/plugin-rsc/transforms";
import { glob } from "tinyglobby";
import { parseAstAsync } from "vite";

// The app's files with `"use client"`: the modules of the browser layer, and
// of the ssr layer, that a page loads by the client references of its Flight
// payload. Nothing imports them ahead of that, so the dev server compiles
// them ahead of the first page only when told: `dev.warmup` in plugin.ts.

const languages = { js: "js", jsx: "jsx", ts: "ts", tsx: "tsx" } as const;

/**
 * The files of the app under `root` that start with `"use client"`: not a
 * test, a story or a file of a package.
 */
export async function useClientFiles(root: string): Promise<string[]> {
  const files = await glob(["**/*.{js,jsx,mjs,ts,tsx,mts}"], {
    cwd: root,
    absolute: true,
    ignore: ["**/node_modules/**", "**/*.{test,spec,stories}.*", "**/*.d.{ts,mts}"],
  });
  const found = await Promise.all(
    files.map(async (file) => {
      const code = await readFile(file, "utf8").catch(() => "");
      if (!code.includes("use client")) return [];
      const extension = /\.m?([jt]sx?)$/.exec(file)![1] as keyof typeof languages;
      const ast = await parseAstAsync(code, { lang: languages[extension] }).catch(() => undefined);
      return ast && hasDirective(ast.body, "use client") ? [file] : [];
    }),
  );
  // In the order of their paths, not of the disk: the config is the same in
  // every run.
  return found.flat().sort();
}
