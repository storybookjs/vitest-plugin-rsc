import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAst } from "vite";
import { describe, expect, test } from "vitest";
import { assertVitestVersion } from "./nextjs/vitest-version.ts";

// Vitest is an optional peer dependency, of any version: a host other than
// Vitest installs the plugin without it, or next to the
// Vitest of the project's own tests. So no file of the build imports Vitest,
// in its code or in its types, but for the setup files that the plugin gives
// Vitest by their path, which no other file imports. This reads the build,
// which is what a host installs: with `pnpm test:dist`, after `pnpm build`.
// Not with `pnpm test`, which runs the source, and could find a build of
// another version on disk.

// oxlint-disable-next-line no-process-env
const runsSource = (process.env.NODE_OPTIONS ?? "").includes("vitest-plugin-rsc-source");

const packageDir = fileURLToPath(new URL("..", import.meta.url));
const distDir = path.join(packageDir, "dist");
const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8")) as {
  peerDependencies: Record<string, string>;
  peerDependenciesMeta: Record<string, { optional?: boolean }>;
};

/**
 * What only Vitest loads: the setup files that the plugin gives it by their
 * path, and the pool of a page in a worker of Node.js with the entry of its
 * worker, which the plugin loads by its path in Vitest's config (index.ts).
 */
const vitestFiles = [
  "nextjs/setup-browser.js",
  "nextjs/setup-node.js",
  "worker-pool.js",
  "workers/forks.js",
];

const isVitest = (specifier: string) => /^(?:vitest|@vitest\/[^/]+)(?:\/|$)/.test(specifier);

// What a module imports: with `import` and `export ... from`, with `import()`,
// and in types with `import("...")`, `declare module "..."` and a reference.
function importsOf(file: string): string[] {
  const code = fs.readFileSync(file, "utf8");
  const found = [...code.matchAll(/^\/\/\/\s*<reference\s+types="([^"]+)"/gm)].map(
    (match) => match[1]!,
  );
  const literal = (value: unknown) => {
    const { type, value: text } = (value ?? {}) as { type?: string; value?: unknown };
    if (type === "Literal" && typeof text === "string") found.push(text);
  };
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node !== "object" || node === null) return;
    const { type, source, id } = node as { type?: string; source?: unknown; id?: unknown };
    if (
      type === "ImportDeclaration" ||
      type === "ExportNamedDeclaration" ||
      type === "ExportAllDeclaration" ||
      type === "ImportExpression" ||
      type === "TSImportType"
    ) {
      literal(source);
    }
    if (type === "TSModuleDeclaration") literal(id);
    for (const value of Object.values(node)) if (typeof value === "object") visit(value);
  };
  visit(parseAst(code, { lang: file.endsWith(".d.ts") ? "ts" : "js" }).body);
  return found;
}

// Every file of JavaScript and of types in the build, by its path in it.
const builtFiles = fs.existsSync(distDir)
  ? fs
      .readdirSync(distDir, { recursive: true, encoding: "utf8" })
      .map((file) => file.split(path.sep).join("/"))
      .filter((file) => /\.(?:js|d\.ts)$/.test(file))
  : [];

test("has Vitest as an optional peer dependency of any version", () => {
  expect(manifest.peerDependencies.vitest).toBe("*");
  expect(manifest.peerDependenciesMeta.vitest).toEqual({ optional: true });
});

test("runs in Vitest 5.0.4 and later, and says so in an older one", () => {
  for (const version of ["5.0.4", "5.1.0", "5.0.10", "6.0.0-beta.1"]) {
    expect(() => assertVitestVersion(version), version).not.toThrow();
  }
  expect(() => assertVitestVersion("4.1.5")).toThrow(
    "vitest-plugin-rsc: runs in Vitest 5.0.4 or later, and this is Vitest 4.1.5.",
  );
  expect(() => assertVitestVersion("5.0.3")).toThrow("this is Vitest 5.0.3");
  expect(() => assertVitestVersion("5.0.0-beta.4")).toThrow("this is Vitest 5.0.0-beta.4");
});

// The files of the build that import `file`, by a path from theirs.
function importersOf(file: string): string[] {
  return builtFiles.filter((importer) =>
    importsOf(path.join(distDir, importer)).some(
      (specifier) =>
        specifier.startsWith(".") &&
        path.posix.join(path.posix.dirname(importer), specifier) === file,
    ),
  );
}

describe.skipIf(runsSource)("the build", () => {
  test("is there", () => {
    expect(builtFiles.length).toBeGreaterThan(0);
  });

  // Or in a chunk of what the setup files share, like setup.ts, which only
  // they import.
  test("imports Vitest in the files that only Vitest loads", () => {
    const importing = builtFiles.filter((file) =>
      importsOf(path.join(distDir, file)).some(isVitest),
    );
    expect(importing).toContain("nextjs/setup-browser.js");
    for (const file of importing) {
      if (vitestFiles.includes(file)) continue;
      expect(importersOf(file), file).not.toEqual([]);
      expect(
        importersOf(file).filter((importer) => !vitestFiles.includes(importer)),
        file,
      ).toEqual([]);
    }
  });

  test("has no other file import the files that only Vitest loads", () => {
    const importing = builtFiles.filter((file) =>
      importsOf(path.join(distDir, file)).some((specifier) =>
        vitestFiles.some((vitestFile) => specifier.endsWith(`/${path.basename(vitestFile)}`)),
      ),
    );
    expect(importing).toEqual([]);
  });

  // The parser finds an import in types as well, or the test above says
  // nothing of a `.d.ts` file.
  test("finds the imports of a file of types", () => {
    const file = builtFiles.find((name) => name.endsWith("plugin.d.ts"))!;
    expect(importsOf(path.join(distDir, file))).toContain("vite");
  });
});
