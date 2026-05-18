import { Buffer } from "node:buffer";
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { init as initCjsLexer, parse as parseCjs } from "cjs-module-lexer";
import * as esModuleLexer from "es-module-lexer";
import type {
  ArrowFunctionExpression,
  FunctionDeclaration,
  FunctionExpression,
  Identifier,
  MemberExpression,
  Node,
  Pattern,
  Program,
} from "estree";
import { walk } from "estree-walker";
import MagicString from "magic-string";
import { parseAstAsync, type Plugin } from "vite";

const virtualCjsBrowserPrefix = "\0rsc:cjs-browser-esm:";
const publicVirtualCjsBrowserPrefix = "/@id/__x00__rsc:cjs-browser-esm:";
const virtualCjsBrowserFiles = new Map<string, string>();
const virtualCjsBrowserIdsByFile = new Map<string, string>();
const executableVirtualCjsBrowserIds = new Set<string>();
const forcedExecutableVirtualCjsBrowserIds = new Set<string>();

export type CjsBrowserPluginOptions = {
  exclude?: (id: string) => boolean;
  name?: string;
  boundary?: {
    include?: (id: string) => boolean;
    includeParent?: (id: string) => boolean;
    // Allows a file to be transformed only after a transformed CJS parent has
    // rewritten its require() to a virtual id. This avoids adding TLA to the raw
    // module when another untransformed CJS dependency still requires it.
    includeReferenced?: (id: string) => boolean;
    moduleId?: (id: string) => string | undefined;
    proxy?: boolean;
  };
  runtime?: {
    include?: (id: string) => boolean;
    moduleId?: (id: string) => string | undefined;
    resolveBareImport?: (source: string, environmentName?: string) => string | undefined;
    rewriteNestedRequires?: boolean | ((id: string) => boolean);
  };
  optimizer?: {
    rewriteParentRequires?: boolean;
  };
  transformAllCjs?: boolean;
};

// This cannot use @vitejs/plugin-rsc's cjsModuleRunnerPlugin directly. The
// upstream plugin emits executable ESM for environments that use Vite's module
// runner transform; this adapter also runs inside RSC dependency optimization,
// where `"use client"` CommonJS modules must become client references instead
// of executing with React Server aliases. The copied blocks below keep
// upstream's CJS detection, require rewriting, interop, and scope behavior.
function tinyassert(condition: unknown): asserts condition {
  if (!condition) throw new Error("Assertion failed");
}

export function cjsBrowserPlugin(pluginOptions: CjsBrowserPluginOptions = {}): Plugin[] {
  return [
    {
      name: pluginOptions.name ?? "rsc:cjs-browser-transform",
      enforce: "pre",
      apply: "serve",
      applyToEnvironment: (env) =>
        env.name === "client" || env.name === "react_client" || env.name === "react_ssr",
      async resolveId(source, importer, options) {
        if (source.startsWith(publicVirtualCjsBrowserPrefix)) {
          return source;
        }
        if (source.startsWith(virtualCjsBrowserPrefix)) return source;

        const importerFile = importer ? parseVirtualCjsBrowserId(importer) : undefined;
        if (importerFile && source.startsWith(".")) {
          const file = resolveRelativeModuleFile(source, importerFile);
          if (!file) return;

          const code = fs.readFileSync(file, "utf8");
          if (executableVirtualCjsBrowserIds.has(importer!)) {
            if (pluginOptions.runtime?.include?.(file)) {
              const id = createVirtualCjsBrowserId(file);
              forcedExecutableVirtualCjsBrowserIds.add(id);
              return id;
            }
          } else if (
            await getCjsTransformMode(code, file, createReferencedCjsOptions(pluginOptions))
          ) {
            return createVirtualCjsBrowserId(file);
          }

          return file;
        }

        if (importerFile) {
          const resolved = await this.resolve(source, importerFile, { ...options, skipSelf: true });
          if (!resolved || resolved.external) return;
          const file = parseIdFilename(resolved.id);
          if (
            executableVirtualCjsBrowserIds.has(importer!) &&
            pluginOptions.runtime?.include?.(file)
          ) {
            const id = createVirtualCjsBrowserId(file);
            forcedExecutableVirtualCjsBrowserIds.add(id);
            return id;
          }
          return resolved.id;
        }

        const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
        if (!resolved || resolved.external) return;

        const file = parseIdFilename(resolved.id);
        if (!file.endsWith(".cjs")) return;

        const code = fs.readFileSync(file, "utf8");
        if (this.environment?.name !== undefined && pluginOptions.runtime?.include?.(file)) {
          const id = createVirtualCjsBrowserId(file);
          forcedExecutableVirtualCjsBrowserIds.add(id);
          return id;
        }
        if (!(await getCjsTransformMode(code, file, pluginOptions))) return;

        return createVirtualCjsBrowserId(file);
      },
      async load(id) {
        const cleanId = parseIdFilename(id);
        const file = parseVirtualCjsBrowserId(id);
        if (!file) return;

        const code = fs.readFileSync(file, "utf8");
        const proxyClientBoundary = shouldProxyVirtualClientBoundary(
          pluginOptions,
          this.environment?.name,
        );
        if (proxyClientBoundary) {
          executableVirtualCjsBrowserIds.delete(cleanId);
        } else {
          executableVirtualCjsBrowserIds.add(cleanId);
        }
        return transformCjsBrowserModule(code, file, {
          ...createReferencedCjsOptions(pluginOptions),
          proxyClientBoundary,
          optimizer: {
            ...pluginOptions.optimizer,
            rewriteParentRequires: shouldRewriteParentRequires(
              pluginOptions,
              this.environment?.name,
            ),
          },
          transformAllCjs: forcedExecutableVirtualCjsBrowserIds.has(cleanId),
          environmentName: this.environment?.name,
          usePublicImportIds:
            !proxyClientBoundary && !forcedExecutableVirtualCjsBrowserIds.has(cleanId),
        });
      },
      transform: {
        filter: {
          id: /\/node_modules\//,
          code: /\b(require|exports)\b/,
        },
        async handler(code, id) {
          const file = parseIdFilename(id);
          if (parseVirtualCjsBrowserId(id) || file.endsWith(".cjs")) return;
          if (this.environment?.name === undefined && pluginOptions.runtime?.include?.(file)) {
            return;
          }

          return transformCjsBrowserModule(code, id, {
            exclude: pluginOptions.exclude,
            boundary: pluginOptions.boundary,
            proxyClientBoundary: shouldProxyClientBoundary(pluginOptions, this.environment?.name),
            transformAllCjs:
              this.environment?.name !== undefined &&
              pluginOptions.runtime?.include?.(file) === true,
            optimizer: {
              ...pluginOptions.optimizer,
              rewriteParentRequires: shouldRewriteParentRequires(
                pluginOptions,
                this.environment?.name,
              ),
            },
            usePublicImportIds: this.environment?.name !== undefined,
            environmentName: this.environment?.name,
            runtime: {
              ...pluginOptions.runtime,
              rewriteNestedRequires: getRewriteNestedRequires(pluginOptions, id),
            },
          });
        },
      },
    },
  ];
}

function shouldProxyClientBoundary(options: CjsBrowserPluginOptions, environmentName?: string) {
  return options.boundary?.proxy ?? environmentName === "client";
}

function shouldProxyVirtualClientBoundary(
  options: CjsBrowserPluginOptions,
  environmentName?: string,
) {
  return (
    options.boundary?.proxy ??
    (environmentName !== "react_client" && environmentName !== "react_ssr")
  );
}

function shouldRewriteParentRequires(options: CjsBrowserPluginOptions, environmentName?: string) {
  return options.optimizer?.rewriteParentRequires && environmentName === undefined;
}

function getRewriteNestedRequires(options: CjsBrowserPluginOptions, id: string) {
  if (typeof options.runtime?.rewriteNestedRequires === "function") {
    return options.runtime.rewriteNestedRequires(parseIdFilename(id));
  }
  return options.runtime?.rewriteNestedRequires;
}

async function transformCjsBrowserModule(
  code: string,
  id: string,
  options: CjsBrowserPluginOptions & {
    environmentName?: string;
    proxyClientBoundary?: boolean;
    usePublicImportIds?: boolean;
  } = {},
) {
  const mode = await getCjsTransformMode(code, id, options);
  if (!mode) return;
  const proxyClientBoundary = options.proxyClientBoundary ?? true;
  if (mode === "client-boundary" && proxyClientBoundary) {
    return createCjsClientReferenceProxy(code, id);
  }
  if (mode === "client-boundary" && !proxyClientBoundary) {
    const moduleId = options.boundary?.moduleId?.(parseIdFilename(id));
    if (moduleId) return createCjsClientBoundaryReExport(code, id, moduleId);
  }

  if (mode === "cjs" && options.optimizer?.rewriteParentRequires) {
    return rewriteCjsParentRequireSources(code, id, createReferencedCjsOptions(options));
  }

  const ast = await parseAstAsync(code, { lang: getParserLanguage(id) }, id);
  const childImportIds = await collectVirtualChildImports(
    code,
    id,
    createReferencedCjsOptions(options),
    options.usePublicImportIds,
  );
  const result = await transformCjsToBrowserEsm(code, ast, {
    id: parseIdFilename(id),
    includeInteropMarker: mode !== "client-boundary" || !proxyClientBoundary,
    resolveImportSource: (source) =>
      childImportIds.get(source) ??
      options.runtime?.resolveBareImport?.(source, options.environmentName),
    rewriteNestedRequires: getRewriteNestedRequires(options, id),
  });
  const output = result.output;
  return {
    code: output.toString(),
    map: output.generateMap({ hires: "boundary" }),
    moduleType: "js",
  };
}

async function rewriteCjsParentRequireSources(
  code: string,
  id: string,
  options: CjsBrowserPluginOptions,
) {
  const ast = (await parseAstAsync(code, { lang: getParserLanguage(id) }, id)) as Program;
  const scopeTree = buildScopeTree(ast);
  const childImportIds = await collectVirtualChildImports(code, id, options);
  if (childImportIds.size === 0) return;

  const output = new MagicString(code);
  visitCommonJsRequireCalls(ast, scopeTree, (node) => {
    replaceImportSource(output, node, (source) => childImportIds.get(source));
  });

  return {
    code: output.toString(),
    map: output.generateMap({ hires: "boundary" }),
    moduleType: "js",
  };
}

function createReferencedCjsOptions(options: CjsBrowserPluginOptions): CjsBrowserPluginOptions {
  if (!options.boundary?.includeReferenced) return options;

  return {
    ...options,
    boundary: {
      ...options.boundary,
      include: (id) =>
        options.boundary?.include?.(id) || options.boundary?.includeReferenced?.(id) || false,
    },
  };
}

async function getCjsTransformMode(
  code: string,
  id: string,
  options: CjsBrowserPluginOptions = {},
) {
  if (!(await isCommonJsDependency(code, id, options))) return false;

  if (options.transformAllCjs) return "cjs";
  if (await hasUseClientDirective(code, id)) return "client-boundary";
  const file = parseIdFilename(id);
  const canTransformParent = options.boundary?.includeParent?.(file) ?? true;
  if (!canTransformParent) return false;
  if (await hasStaticUseClientRequire(code, id, new Set(), options)) return "cjs";
  return false;
}

// Begin copy: @vitejs/plugin-rsc CommonJS dependency detection
// Source: https://github.com/vitejs/vite-plugin-react/blob/2b8df67323265d1ff5ddf47b2db9ab0b9de5c688/packages/plugin-rsc/src/plugins/cjs.ts
// Adaptation: upstream transforms every non-optimized CJS dependency for
// Vite's module runner. The browser/RSC adapter only uses this predicate as the
// shared CJS detector; getCjsTransformMode further narrows it to `"use client"`
// boundaries so unrelated server CJS is left untouched.
async function isCommonJsDependency(
  code: string,
  id: string,
  options: CjsBrowserPluginOptions = {},
) {
  if (
    !id.includes("/node_modules/") ||
    id.startsWith(getEnvironmentCacheDir(id)) ||
    !/\b(require|exports)\b/.test(code)
  ) {
    return false;
  }

  id = parseIdFilename(id);
  if (!options.transformAllCjs && !options.boundary?.include?.(id) && options.exclude?.(id)) {
    return false;
  }
  if (!/\.[cm]?js$/.test(id)) return false;
  if (id.endsWith(".mjs")) return false;

  if (id.endsWith(".js")) {
    const pkgJsonPath = findClosestPkgJsonPath(path.dirname(id));
    if (pkgJsonPath) {
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as { type?: string };
      if (pkgJson.type === "module") return false;
    }
  }

  await esModuleLexer.init;
  const [, , , hasModuleSyntax] = esModuleLexer.parse(code);
  if (hasModuleSyntax) return false;

  return true;
}
// End copy

async function hasStaticUseClientRequire(
  code: string,
  id: string,
  seen: Set<string>,
  options: CjsBrowserPluginOptions,
) {
  const file = parseIdFilename(id);
  if (seen.has(file)) return false;
  seen.add(file);

  const ast = (await parseAstAsync(code, { lang: getParserLanguage(id) }, id)) as Program;
  const scopeTree = buildScopeTree(ast);
  for (const source of collectStaticRequireSources(ast, scopeTree, { topLevelOnly: true })) {
    if (!source.startsWith(".")) continue;

    const resolved = resolveRelativeModuleFile(source, file);
    if (!resolved) continue;

    const resolvedCode = fs.readFileSync(resolved, "utf8");
    if (await hasUseClientDirective(resolvedCode, resolved)) return true;
    if (
      (await isCommonJsDependency(resolvedCode, resolved, options)) &&
      (await hasStaticUseClientRequire(resolvedCode, resolved, seen, options))
    ) {
      return true;
    }
  }

  return false;
}

export async function collectCjsRequireSources(
  code: string,
  id: string,
  options: { topLevelOnly?: boolean } = {},
) {
  const ast = (await parseAstAsync(code, { lang: getParserLanguage(id) }, id)) as Program;
  return collectStaticRequireSources(ast, buildScopeTree(ast), options);
}

function collectStaticRequireSources(
  program: Program,
  scopeTree: ScopeTree,
  options: { topLevelOnly?: boolean } = {},
) {
  const sources = new Set<string>();
  visitCommonJsRequireCalls(program, scopeTree, (node, parentNodes) => {
    if (options.topLevelOnly && !isTopLevelRequire(parentNodes)) return;

    const argument = node.arguments[0];
    if (argument?.type === "Literal" && typeof argument.value === "string") {
      sources.add(argument.value);
    }
  });
  return sources;
}

function isTopLevelRequire(parentNodes: Node[]) {
  return !parentNodes.some(
    (parent) =>
      parent.type === "FunctionExpression" ||
      parent.type === "FunctionDeclaration" ||
      parent.type === "ArrowFunctionExpression",
  );
}

// Begin copy: @vitejs/plugin-rsc CommonJS require visitor
// Source: https://github.com/vitejs/vite-plugin-react/blob/2b8df67323265d1ff5ddf47b2db9ab0b9de5c688/packages/plugin-rsc/src/transforms/cjs.ts
// Adaptation: factored from upstream's transform walk so boundary detection and
// browser ESM rewriting use the same scope-aware definition of CommonJS
// `require`. The callback is local to this file instead of directly mutating a
// MagicString.
function visitCommonJsRequireCalls(
  program: Program,
  scopeTree: ScopeTree,
  callback: (node: Extract<Node, { type: "CallExpression" }>, parentNodes: Node[]) => void,
) {
  const parentNodes: Node[] = [];

  walk(program, {
    enter(node) {
      parentNodes.push(node);
      if (
        node.type === "CallExpression" &&
        node.callee.type === "Identifier" &&
        node.callee.name === "require" &&
        node.arguments.length === 1
      ) {
        for (const parent of parentNodes) {
          const scope = scopeTree.nodeScope.get(parent);
          if (scope?.declarations.has("require")) {
            return;
          }
        }

        callback(node, parentNodes);
      }
    },
    leave() {
      parentNodes.pop()!;
    },
  });
}
// End copy

// Begin copy: @vitejs/plugin-rsc CommonJS interop helper
// Source: https://github.com/vitejs/vite-plugin-react/blob/2b8df67323265d1ff5ddf47b2db9ab0b9de5c688/packages/plugin-rsc/src/transforms/cjs.ts
// Adaptation: TypeScript annotations are widened to unknown for this package,
// but the runtime unwrapping logic matches upstream.
function __cjs_interop__(m: unknown) {
  return m &&
    typeof m === "object" &&
    ("__cjs_module_runner_transform" in m ||
      ("default" in m &&
        (m as { default: unknown }).default != null &&
        Object.keys(m).every(
          (k) =>
            k === "default" ||
            (m as Record<string, unknown>)[k] ===
              ((m as { default: Record<string, unknown> }).default ?? {})[k],
        )))
    ? (m as { default: unknown }).default
    : m;
}
// End copy

const CJS_INTEROP_HELPER = __cjs_interop__.toString().replace(/\n\s*/g, "");
const reservedExportNames = new Set([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

export async function transformCjsToBrowserEsm(
  code: string,
  ast: unknown,
  options: {
    id: string;
    includeInteropMarker?: boolean;
    resolveImportSource?: (source: string) => string | undefined;
    rewriteNestedRequires?: boolean;
  },
): Promise<{ output: MagicString }> {
  await initCjsLexer();
  const program = ast as Program;
  const output = new MagicString(code);
  const scopeTree = buildScopeTree(program);

  const hoistedCodes: string[] = [];
  rewriteRequireCallsToDynamicImports(code, output, program, scopeTree, {
    hoistedCodes,
    resolveImportSource: options.resolveImportSource,
    rewriteNestedRequires: options.rewriteNestedRequires,
  });

  const exportNames = collectCjsExportNames(code, options.id, new Set());
  const __filename = fileURLToPath(pathToFileURL(options.id).href);
  const __dirname = path.dirname(__filename);
  output.prependLeft(
    getDirectiveEnd(program),
    [
      createDirectiveSeparator(code, program),
      `let __filename = ${JSON.stringify(__filename)}; let __dirname = ${JSON.stringify(__dirname)};\n`,
      `var exports = {}; var module = { exports };\n`,
      `${CJS_INTEROP_HELPER}\n`,
      ...hoistedCodes.reverse(),
    ].join(""),
  );

  output.append(
    createBrowserEsmExports(code, program, {
      id: options.id,
      exportNames,
      includeInteropMarker: options.includeInteropMarker,
    }),
  );

  return { output };
}

// Begin copy: @vitejs/plugin-rsc CommonJS require rewrite
// Source: https://github.com/vitejs/vite-plugin-react/blob/2b8df67323265d1ff5ddf47b2db9ab0b9de5c688/packages/plugin-rsc/src/transforms/cjs.ts
// Adaptation: upstream emits ModuleRunner output after this rewrite. This copy
// keeps the same scope-aware require handling, but transformCjsToBrowserEsm
// appends browser ESM exports instead of `__vite_ssr_exportAll__`.
function rewriteRequireCallsToDynamicImports(
  code: string,
  output: MagicString,
  program: Program,
  scopeTree: ScopeTree,
  options: {
    hoistedCodes?: string[];
    resolveImportSource?: (source: string) => string | undefined;
    rewriteNestedRequires?: boolean;
  } = {},
) {
  const parentNodes: Node[] = [];
  const hoistedCodes = options.hoistedCodes ?? [];
  let hoistIndex = 0;

  walk(program, {
    enter(node) {
      parentNodes.push(node);
      if (
        node.type === "CallExpression" &&
        node.callee.type === "Identifier" &&
        node.callee.name === "require" &&
        node.arguments.length === 1
      ) {
        let isTopLevel = true;
        for (const parent of parentNodes) {
          if (
            parent.type === "FunctionExpression" ||
            parent.type === "FunctionDeclaration" ||
            parent.type === "ArrowFunctionExpression"
          ) {
            isTopLevel = false;
          }
          const scope = scopeTree.nodeScope.get(parent);
          if (scope?.declarations.has("require")) {
            return;
          }
        }

        if (isTopLevel) {
          const call = node as typeof node & PositionedNode;
          const callee = node.callee as typeof node.callee & PositionedNode;
          replaceImportSource(output, node, options.resolveImportSource);
          output.update(call.start, callee.end, "(__cjs_interop__(await import");
          output.appendRight(call.end, "))");
        } else {
          if (options.rewriteNestedRequires === false) return;

          const call = node as typeof node & PositionedNode;
          const argument = node.arguments[0] as Node & PositionedNode;
          const hoisted = `__cjs_to_esm_hoist_${hoistIndex}`;
          const importee =
            getResolvedImportSource(node, options.resolveImportSource) ??
            code.slice(argument.start, argument.end);
          hoistedCodes.push(`const ${hoisted} = __cjs_interop__(await import(${importee}));\n`);
          output.update(call.start, call.end, hoisted);
          hoistIndex++;
        }
      }
    },
    leave() {
      parentNodes.pop()!;
    },
  });
}
// End copy

async function collectVirtualChildImports(
  code: string,
  id: string,
  options: CjsBrowserPluginOptions,
  usePublicImportIds = false,
) {
  const ast = (await parseAstAsync(code, { lang: getParserLanguage(id) }, id)) as Program;
  const sources = collectStaticRequireSources(ast, buildScopeTree(ast));
  const resolved = new Map<string, string>();
  const file = parseIdFilename(id);

  for (const source of sources) {
    if (!source.startsWith(".")) continue;

    const childFile = resolveRelativeModuleFile(source, file);
    if (!childFile) continue;

    if (options.transformAllCjs && usePublicImportIds) {
      const runtimeModuleId = options.runtime?.moduleId?.(childFile);
      if (runtimeModuleId) {
        resolved.set(source, runtimeModuleId);
        continue;
      }
    }

    const childCode = fs.readFileSync(childFile, "utf8");
    if (await getCjsTransformMode(childCode, childFile, options)) {
      const virtualId = createVirtualCjsBrowserId(childFile);
      if (options.transformAllCjs) {
        forcedExecutableVirtualCjsBrowserIds.add(virtualId);
      }
      resolved.set(source, usePublicImportIds ? createCjsBrowserPublicId(childFile) : virtualId);
    }
  }

  return resolved;
}

function replaceImportSource(
  output: MagicString,
  node: Extract<Node, { type: "CallExpression" }>,
  resolveImportSource?: (source: string) => string | undefined,
) {
  const resolved = getResolvedImportSource(node, resolveImportSource);
  if (!resolved) return;

  const argument = node.arguments[0] as Node & PositionedNode;
  output.update(argument.start, argument.end, resolved);
}

function getResolvedImportSource(
  node: Extract<Node, { type: "CallExpression" }>,
  resolveImportSource?: (source: string) => string | undefined,
) {
  if (!resolveImportSource) return;

  const argument = node.arguments[0];
  if (argument?.type !== "Literal" || typeof argument.value !== "string") return;

  const resolved = resolveImportSource(argument.value);
  return resolved ? JSON.stringify(resolved) : undefined;
}

function createCjsBrowserPublicId(id: string) {
  const virtualId = createVirtualCjsBrowserId(id);
  return `/@id/__x00__${virtualId.slice(1)}`;
}

async function createCjsClientReferenceProxy(code: string, id: string) {
  await initCjsLexer();

  // @vitejs/plugin-rsc's directive proxy transform works after source is ESM.
  // For CJS client boundaries in dep optimization, emitting references directly
  // avoids introducing top-level await into raw modules that other CJS parents
  // may still require. The reference key points at this plugin's virtual CJS
  // module, which loads as client references in RSC and executable ESM in the
  // browser/SSR environments.
  const exportNames = collectCjsExportNames(code, id, new Set());
  exportNames.add("default");
  const namedExports = [...exportNames]
    .filter(isNamedCjsExport)
    .map((name) => `export const ${name} = createClientReference(${JSON.stringify(name)});`)
    .join("\n");

  return {
    code: `
import { registerClientReference } from "@vitejs/plugin-rsc/react/rsc";

const clientReferenceId = ${JSON.stringify(createCjsBrowserPublicId(id))};

function createClientReference(name) {
  return registerClientReference(
    function() {
      throw new Error("Unexpectedly client reference export '" + name + "' from " + clientReferenceId + " is called on server");
    },
    clientReferenceId,
    name
  );
}

export default createClientReference("default");
${namedExports}
`,
    moduleType: "js",
  };
}

async function createCjsClientBoundaryReExport(code: string, id: string, moduleId: string) {
  await initCjsLexer();

  const exportNames = collectCjsExportNames(code, id, new Set());
  exportNames.add("default");
  const exports = [...exportNames].filter(isReExportedCjsExport).join(", ");
  return {
    code: `"use client";\nexport { ${exports} } from ${JSON.stringify(moduleId)};\n`,
    moduleType: "js",
  };
}

function isReExportedCjsExport(name: string) {
  return name === "default" || isNamedCjsExport(name);
}

function createBrowserEsmExports(
  code: string,
  ast: Program,
  options: { id: string; exportNames?: Set<string>; includeInteropMarker?: boolean },
) {
  const exportNames = options.exportNames ?? collectCjsExportNames(code, options.id, new Set());
  const topLevelDeclarations = getTopLevelDeclarations(ast);
  const namedExports = [...exportNames].filter(isNamedCjsExport);

  return `
const __cjs_exports__ = module.exports;
const __cjs_default__ = __cjs_interop__(__cjs_exports__);
export default __cjs_default__;
${options.includeInteropMarker === false ? "" : "export const __cjs_module_runner_transform = true;"}
${namedExports
  .map((name) =>
    topLevelDeclarations.has(name)
      ? `export { ${name} };`
      : `export const ${name} = __cjs_exports__[${JSON.stringify(name)}];`,
  )
  .join("\n")}
`;
}

function isNamedCjsExport(name: string) {
  return (
    name !== "default" &&
    name !== "__esModule" &&
    name !== "__cjs_module_runner_transform" &&
    name !== "exports" &&
    name !== "module" &&
    !reservedExportNames.has(name) &&
    /^[A-Za-z_$][\w$]*$/.test(name)
  );
}

function collectCjsExportNames(code: string, id: string, seen: Set<string>) {
  const file = parseIdFilename(id);
  if (seen.has(file)) return new Set<string>();
  seen.add(file);

  const { exports, reexports } = parseCjs(code);
  const names = new Set(exports);

  for (const source of reexports) {
    if (!source.startsWith(".")) continue;

    const resolved = resolveRelativeModuleFile(source, file);
    if (!resolved) continue;

    const resolvedCode = fs.readFileSync(resolved, "utf8");
    for (const name of collectCjsExportNames(resolvedCode, resolved, seen)) {
      names.add(name);
    }
  }

  return names;
}

function getTopLevelDeclarations(ast: Program) {
  const declarations = new Set<string>();
  for (const node of ast.body) {
    if (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") {
      if (node.id) declarations.add(node.id.name);
    } else if (node.type === "VariableDeclaration") {
      for (const declaration of node.declarations)
        for (const name of extractNames(declaration.id)) declarations.add(name);
    }
  }
  return declarations;
}

// Begin copy: @vitejs/plugin-rsc CJS scope handling
// Source: https://github.com/vitejs/vite-plugin-react/blob/2b8df67323265d1ff5ddf47b2db9ab0b9de5c688/packages/plugin-rsc/src/transforms/scope.ts
// Adaptation: copied into this file to keep the CJS browser transform
// self-contained. Export modifiers were removed and imports were inlined.
class Scope {
  readonly declarations: Set<string> = new Set<string>();
  readonly parent: Scope | undefined;
  private readonly isFunction: boolean;

  constructor(parent: Scope | undefined, isFunction: boolean) {
    this.parent = parent;
    this.isFunction = isFunction;
  }

  getNearestFunctionScope(): Scope {
    return this.isFunction ? this : this.parent!.getNearestFunctionScope();
  }

  getAncestorScopes(): Set<Scope> {
    const ancestors = new Set<Scope>();
    let curr = this.parent;
    while (curr) {
      ancestors.add(curr);
      curr = curr.parent;
    }
    return ancestors;
  }
}

type ScopeTree = {
  readonly referenceToDeclaredScope: Map<Identifier, Scope>;
  readonly scopeToReferences: Map<Scope, Identifier[]>;
  readonly nodeScope: Map<Node, Scope>;
  readonly moduleScope: Scope;
  readonly referenceToNode: Map<Identifier, Identifier | MemberExpression>;
};

type PositionedNode = {
  start: number;
  end: number;
};

function buildScopeTree(ast: Program): ScopeTree {
  const moduleScope = new Scope(undefined, true);
  const nodeScope = new Map<Node, Scope>();
  let current = moduleScope;
  nodeScope.set(ast, moduleScope);

  const rawReferences: Array<{ id: Identifier; visitScope: Scope }> = [];
  const ancestors: Node[] = [];
  const referenceToNode = new Map<Identifier, Identifier | MemberExpression>();

  walk(ast, {
    enter(node) {
      ancestors.push(node);
      if (node.type === "ImportDeclaration") {
        for (const specifier of node.specifiers) current.declarations.add(specifier.local.name);
      } else if (isFunctionNode(node)) {
        if (node.type === "FunctionDeclaration" && node.id) {
          current.declarations.add(node.id.name);
        }
        const scope = new Scope(current, true);
        nodeScope.set(node, scope);
        current = scope;
        for (const param of node.params)
          for (const name of extractNames(param)) scope.declarations.add(name);
        if (node.type === "FunctionExpression" && node.id) scope.declarations.add(node.id.name);
      } else if (node.type === "ClassDeclaration" && node.id) {
        current.declarations.add(node.id.name);
      } else if (node.type === "ClassExpression" && node.id) {
        const scope = new Scope(current, false);
        scope.declarations.add(node.id.name);
        nodeScope.set(node, scope);
        current = scope;
      } else if (
        node.type === "BlockStatement" ||
        node.type === "ForStatement" ||
        node.type === "ForInStatement" ||
        node.type === "ForOfStatement" ||
        node.type === "SwitchStatement"
      ) {
        const scope = new Scope(current, false);
        nodeScope.set(node, scope);
        current = scope;
      } else if (node.type === "CatchClause") {
        const scope = new Scope(current, false);
        nodeScope.set(node, scope);
        current = scope;
        if (node.param) for (const name of extractNames(node.param)) scope.declarations.add(name);
      } else if (node.type === "VariableDeclaration") {
        const target = node.kind === "var" ? current.getNearestFunctionScope() : current;
        for (const declaration of node.declarations)
          for (const name of extractNames(declaration.id)) target.declarations.add(name);
      }
      if (
        node.type === "Identifier" &&
        isReferenceIdentifier(node, ancestors.slice(0, -1).reverse())
      ) {
        const parentStack = ancestors.slice(0, -1).reverse();
        const bindableNode = getOutermostBindableReference(node, parentStack);
        referenceToNode.set(node, bindableNode);
        rawReferences.push({ id: node, visitScope: current });
      }
    },
    leave(node) {
      ancestors.pop();
      const scope = nodeScope.get(node);
      if (scope?.parent) current = scope.parent;
    },
  });

  const scopeToReferences = new Map<Scope, Identifier[]>(
    [...nodeScope.values()].map((scope) => [scope, []]),
  );
  const referenceToDeclaredScope = new Map<Identifier, Scope>();

  for (const { id, visitScope } of rawReferences) {
    let declScope: Scope | undefined = visitScope;
    while (declScope && !declScope.declarations.has(id.name)) {
      declScope = declScope.parent;
    }
    if (declScope) {
      referenceToDeclaredScope.set(id, declScope);
    }
    let scope: Scope | undefined = visitScope;
    while (scope) {
      scopeToReferences.get(scope)!.push(id);
      scope = scope.parent;
    }
  }

  return {
    referenceToDeclaredScope,
    scopeToReferences,
    nodeScope,
    moduleScope,
    referenceToNode,
  };
}

type AnyFunctionNode = FunctionDeclaration | FunctionExpression | ArrowFunctionExpression;

function isFunctionNode(node: Node): node is AnyFunctionNode {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  );
}

function extractNames(param: Pattern): string[] {
  return extractIdentifiers(param).map((node) => node.name);
}

function extractIdentifiers(param: Pattern, nodes: Extract<Node, { type: "Identifier" }>[] = []) {
  switch (param.type) {
    case "Identifier":
      nodes.push(param);
      break;
    case "MemberExpression": {
      let obj: Node = param;
      while (obj.type === "MemberExpression") obj = obj.object;
      if (obj.type === "Identifier") nodes.push(obj);
      break;
    }
    case "ObjectPattern":
      for (const prop of param.properties) {
        extractIdentifiers(prop.type === "RestElement" ? prop : prop.value, nodes);
      }
      break;
    case "ArrayPattern":
      for (const el of param.elements) {
        if (el) extractIdentifiers(el, nodes);
      }
      break;
    case "RestElement":
      extractIdentifiers(param.argument, nodes);
      break;
    case "AssignmentPattern":
      extractIdentifiers(param.left, nodes);
      break;
  }
  return nodes;
}

function isReferenceIdentifier(node: Identifier, parentStack: Node[]): boolean {
  const parent = parentStack[0];
  if (!parent) return true;

  if (
    parent.type === "CatchClause" ||
    ((parent.type === "VariableDeclarator" ||
      parent.type === "ClassDeclaration" ||
      parent.type === "ClassExpression") &&
      parent.id === node)
  ) {
    return false;
  }

  if (isFunctionNode(parent)) {
    if ("id" in parent && parent.id === node) {
      return false;
    }
    if (parent.params.includes(node)) {
      return false;
    }
  }

  if (
    (parent.type === "MethodDefinition" ||
      parent.type === "PropertyDefinition" ||
      parent.type === "Property") &&
    parent.key === node &&
    !parent.computed
  ) {
    return false;
  }

  if (parent.type === "MemberExpression" && parent.property === node && !parent.computed) {
    return false;
  }

  if (parent.type === "MetaProperty") {
    return false;
  }

  if (
    parent.type === "Property" &&
    parent.value === node &&
    parentStack[1]?.type === "ObjectPattern"
  ) {
    return isInDestructuringAssignment(parentStack);
  }

  if (parent.type === "ArrayPattern") {
    return isInDestructuringAssignment(parentStack);
  }

  if (parent.type === "RestElement" && parent.argument === node) {
    return isInDestructuringAssignment(parentStack);
  }

  if (parent.type === "AssignmentPattern" && parent.left === node) {
    return isInDestructuringAssignment(parentStack);
  }

  if (
    parent.type === "ImportSpecifier" ||
    parent.type === "ImportDefaultSpecifier" ||
    parent.type === "ImportNamespaceSpecifier"
  ) {
    return false;
  }

  if (parent.type === "ExportSpecifier") {
    return parent.local === node;
  }

  if (
    parent.type === "LabeledStatement" ||
    parent.type === "BreakStatement" ||
    parent.type === "ContinueStatement"
  ) {
    return false;
  }

  return true;
}

function isInDestructuringAssignment(parentStack: Node[]): boolean {
  return parentStack.some((node) => node.type === "AssignmentExpression");
}

function getOutermostBindableReference(
  id: Identifier,
  parentStack: Node[],
): Identifier | MemberExpression {
  let current: Identifier | MemberExpression = id;

  for (const parent of parentStack) {
    if (parent.type === "MemberExpression" && parent.object === current) {
      if (parent.computed || parent.optional) {
        break;
      }
      current = parent;
    } else {
      if (
        parent.type === "CallExpression" &&
        parent.callee === current &&
        current.type === "MemberExpression"
      ) {
        tinyassert(
          current.object.type === "Identifier" || current.object.type === "MemberExpression",
        );
        current = current.object;
      }
      break;
    }
  }

  return current;
}
// End copy

function getDirectiveEnd(ast: Program) {
  let end = 0;
  for (const node of ast.body) {
    if (
      node.type === "ExpressionStatement" &&
      node.expression.type === "Literal" &&
      typeof node.expression.value === "string"
    ) {
      end = (node as typeof node & PositionedNode).end;
      continue;
    }
    break;
  }
  return end;
}

function createDirectiveSeparator(code: string, ast: Program) {
  const end = getDirectiveEnd(ast);
  return end > 0 && code[end] !== ";" ? ";\n" : "\n";
}

function parseIdFilename(id: string) {
  return id.replace(/\?.*$/, "");
}

function resolveRelativeModuleFile(source: string, importer: string) {
  const resolved = path.resolve(path.dirname(importer), source);
  for (const candidate of [
    resolved,
    `${resolved}.js`,
    `${resolved}.cjs`,
    `${resolved}.mjs`,
    path.join(resolved, "index.js"),
    path.join(resolved, "index.cjs"),
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
}

export async function hasUseClientDirective(code: string, id: string) {
  if (!code.includes("use client")) return false;

  const ast = (await parseAstAsync(code, { lang: getParserLanguage(id) }, id)) as Program;
  return hasDirective(ast.body, "use client");
}

// Begin copy: @vitejs/plugin-rsc directive detection
// Source: https://github.com/vitejs/vite-plugin-react/blob/2b8df67323265d1ff5ddf47b2db9ab0b9de5c688/packages/plugin-rsc/src/transforms/utils.ts
// Adaptation: copied locally because `hasDirective` is not part of the public
// `@vitejs/plugin-rsc/transforms` export used by this package.
function hasDirective(body: Program["body"], directive: string): boolean {
  return !!body.find(
    (stmt) =>
      stmt.type === "ExpressionStatement" &&
      stmt.expression.type === "Literal" &&
      typeof stmt.expression.value === "string" &&
      stmt.expression.value === directive,
  );
}
// End copy

function createVirtualCjsBrowserId(file: string) {
  const normalized = parseIdFilename(file);
  const existing = virtualCjsBrowserIdsByFile.get(normalized);
  if (existing) return existing;

  const hash = createHash("sha1").update(normalized).digest("hex").slice(0, 12);
  const encoded = Buffer.from(normalized).toString("base64url");
  const id = `${virtualCjsBrowserPrefix}${hash}:${path.basename(normalized)}:${encoded}.mjs`;
  virtualCjsBrowserFiles.set(id, normalized);
  virtualCjsBrowserIdsByFile.set(normalized, id);
  return id;
}

function parseVirtualCjsBrowserId(id: string) {
  const cleanId = parseIdFilename(id);
  const virtualId = cleanId.startsWith(publicVirtualCjsBrowserPrefix)
    ? `\0${cleanId.slice("/@id/__x00__".length)}`
    : cleanId;
  if (!virtualId.startsWith(virtualCjsBrowserPrefix) || !virtualId.endsWith(".mjs")) return;
  const mapped = virtualCjsBrowserFiles.get(virtualId);
  if (mapped) return mapped;

  const parts = virtualId.slice(virtualCjsBrowserPrefix.length, -".mjs".length).split(":");
  if (parts.length < 3) return;

  const encoded = parts.at(-1);
  if (!encoded) return;

  try {
    return Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return;
  }
}

function getEnvironmentCacheDir(id: string) {
  const index = id.indexOf("/node_modules/.vite/");
  return index === -1 ? "\0" : id.slice(0, index + "/node_modules/.vite/".length);
}

function findClosestPkgJsonPath(directory: string) {
  let current = directory;
  while (current !== path.dirname(current)) {
    const pkgJson = path.join(current, "package.json");
    if (fs.existsSync(pkgJson)) return pkgJson;
    current = path.dirname(current);
  }
}

function getParserLanguage(id: string) {
  const file = parseIdFilename(id);
  if (file.endsWith(".tsx")) return "tsx";
  if (file.endsWith(".ts") || file.endsWith(".mts") || file.endsWith(".cts")) return "ts";
  if (file.endsWith(".jsx")) return "jsx";
  return "js";
}
