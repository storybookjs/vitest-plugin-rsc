import fs from "node:fs";
import path from "node:path";
import { normalizePath, type EnvironmentModuleGraph, type EnvironmentModuleNode } from "vite";

// The files a test file depends on, after it has run: read off Vite's module
// graphs, and off the project for the files that no module imports.

const stylesheet = /\.(css|scss|sass|less|styl|stylus|pcss|postcss)$/;

/** The modules by a name the browser has for them: an id, a URL or a file. */
export function modulesNamed(
  graph: EnvironmentModuleGraph,
  name: string,
  root: string,
): EnvironmentModuleNode[] {
  const found = graph.getModuleById(name) ?? graph.urlToModuleMap.get(name);
  if (found) return [found];
  const fromRoot = normalizePath(path.resolve(root, name.replace(/^\/+/, "")));
  return [...(graph.getModulesByFile(name) ?? []), ...(graph.getModulesByFile(fromRoot) ?? [])];
}

/**
 * The files that `files` and `modules` reach through the imports in `graphs`,
 * themselves included. `skip` says which modules to stop at.
 */
export function filesReachedFrom(
  graphs: EnvironmentModuleGraph[],
  start: { files: string[]; modules: EnvironmentModuleNode[] },
  skip: (id: string) => boolean,
): string[] {
  const files = new Set<string>();
  const seen = new Set<EnvironmentModuleNode>();
  const queue = [...start.modules];
  const add = (file: string) => {
    if (files.has(file)) return;
    files.add(file);
    // One file is a module in each layer that has it, with its own imports:
    // those of a Client Component are in the layers of the client.
    for (const graph of graphs) queue.push(...(graph.getModulesByFile(file) ?? []));
    // Vitest loads a mock from here in place of the file. Also when it is not
    // there yet: it may come.
    if (!file.includes("/__mocks__/")) {
      add(path.posix.join(path.posix.dirname(file), "__mocks__", path.posix.basename(file)));
    }
  };

  for (const file of start.files) add(normalizePath(file));
  for (let node = queue.pop(); node; node = queue.pop()) {
    if (seen.has(node)) continue;
    seen.add(node);
    const file = node.file && path.isAbsolute(node.file) ? normalizePath(node.file) : undefined;
    if (!node.id) {
      // A file that is only watched. A stylesheet that another one imports is
      // one. So is every file Tailwind scans, which no test depends on.
      if (file && stylesheet.test(file)) add(file);
      continue;
    }
    if (skip(node.id) || file?.includes("/node_modules/")) continue;
    if (file) add(file);
    queue.push(...node.importedModules);
  }
  return [...files];
}

const nextFile =
  /^(next\.config|middleware|proxy|instrumentation(-client)?)\.\w+$|^[tj]sconfig(\.[\w-]+)?\.json$|^\.env(\.|$)/;

/**
 * The files of a project that every test file depends on and that no module
 * imports: what Next reads next to the `app` directory, in the root or in
 * `src`, and the mocks of packages, which Vitest reads from the root.
 */
export function projectFiles(next: { root: string; appDir: string }): string[] {
  const mocks = path.join(next.root, "__mocks__");
  return [
    ...[...new Set([next.root, path.dirname(next.appDir)])].flatMap((directory) =>
      fs
        .readdirSync(directory)
        .filter((name) => nextFile.test(name))
        .map((name) => path.join(directory, name)),
    ),
    ...(fs.existsSync(mocks)
      ? (fs.readdirSync(mocks, { recursive: true }) as string[])
          .map((name) => path.join(mocks, name))
          .filter((file) => fs.statSync(file).isFile())
      : []),
  ].map(normalizePath);
}

// A file like `next.config.ts` is in no module graph of Vite: Next loads it.
// What it imports from the project is read off its text, and so is what a
// `tsconfig.json` extends. Every string that looks like a path from the file
// counts: one too many is a test file too many, not one too few.
const relativeSpecifier = /["'](\.{1,2}\/[^"'\n]+)["']/g;
const endings = ["", ".ts", ".mts", ".cts", ".js", ".mjs", ".cjs", ".json", ".tsx", ".jsx"];

/** `files`, and the files of the project that they import. */
export function withImports(files: string[], seen = new Set<string>()): string[] {
  for (const file of files) {
    if (seen.has(file)) continue;
    seen.add(file);
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const imported = Array.from(text.matchAll(relativeSpecifier), ([, specifier]) => {
      const base = path.resolve(path.dirname(file), specifier!);
      return [...endings, ...endings.map((ending) => `/index${ending}`)]
        .map((ending) => base + ending)
        .find((candidate) => fs.statSync(candidate, { throwIfNoEntry: false })?.isFile());
    });
    withImports(
      imported.flatMap((found) => (found ? [normalizePath(found)] : [])),
      seen,
    );
  }
  return [...seen];
}
