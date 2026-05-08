import { promises as fs } from "node:fs";
import path from "node:path";
import { type Plugin, type PluginOption, type UserConfig } from "vite";
import { vitePluginRscMinimal } from "@vitejs/plugin-rsc/plugin";

const reactClientEnvironmentName = "react_client";

const reactClientOptimizeDepsFallbackEntries = [
  "src/**/*.{js,jsx,ts,tsx}",
  "app/**/*.{js,jsx,ts,tsx}",
  "components/**/*.{js,jsx,ts,tsx}",
];

const reactClientEntryRoots = ["src", "app", "components"];
const reactClientEntryExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const ignoredEntryDirectories = new Set([
  ".git",
  ".next",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

export function vitestPluginRSC(): Plugin[] {
  return [
    ...vitePluginRscMinimal({
      environment: {
        browser: reactClientEnvironmentName,
        rsc: "client",
      },
    }),
    {
      name: "rsc:run-in-browser",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url ?? "/", "https://any.local");
          if (url.pathname === "/@vite/invoke-react-client") {
            const payload = JSON.parse(url.searchParams.get("data")!);
            const result = await server.environments["react_client"]!.hot.handleInvoke(payload);
            res.end(JSON.stringify(result));
            return;
          }
          next();
        });
      },
      hotUpdate(ctx) {
        // TODO find out how to do HMR
        ctx.server.ws.send({ type: "full-reload", path: ctx.file });
      },
      config() {
        return {
          environments: {
            client: {
              keepProcessEnv: false,
              resolve: {
                conditions: ["browser", "react-server"],
              },
              optimizeDeps: {
                include: [
                  "react",
                  "react-dom",
                  "react-dom/client",
                  "react/jsx-runtime",
                  "react/jsx-dev-runtime",
                  "@vitejs/plugin-rsc/vendor/react-server-dom/server.edge",
                  "@vitejs/plugin-rsc/vendor/react-server-dom/client.edge",
                ],
                exclude: ["vite", "vitest-plugin-rsc", "@vitejs/plugin-rsc"],
              },
            },
            [reactClientEnvironmentName]: {
              keepProcessEnv: false,
              resolve: {
                conditions: ["browser"],
                noExternal: true,
              },
              optimizeDeps: {
                include: [
                  "react",
                  "react-dom",
                  "react-dom/client",
                  "react/jsx-runtime",
                  "react/jsx-dev-runtime",
                  "@vitejs/plugin-rsc/vendor/react-server-dom/client.browser",
                ],
                noDiscovery: false,
                exclude: ["vitest-plugin-rsc", "@vitejs/plugin-rsc"],
                esbuildOptions: {
                  platform: "browser",
                },
              },
            },
          },
        };
      },
    },
    {
      name: "rsc:react-client-optimizer",
      config: {
        order: "post",
        async handler(config) {
          if (!isVitestBrowserServer(config)) {
            disableOptimizer(config, "client");
            disableOptimizer(config, reactClientEnvironmentName);
            return;
          }

          const reactClient = ((config.environments ??= {})[reactClientEnvironmentName] ??= {});

          const optimizeDeps = (reactClient.optimizeDeps ??= {});
          optimizeDeps.noDiscovery = false;
          optimizeDeps.entries ??=
            (await findReactClientEntries(config.root)) ?? reactClientOptimizeDepsFallbackEntries;
        },
      },
    },
  ];
}

function isPlugin(plugin: PluginOption): plugin is Plugin {
  return !!plugin && typeof plugin === "object" && "name" in plugin;
}

function flattenPluginNames(plugins: PluginOption[] | undefined): string[] {
  const names: string[] = [];

  for (const plugin of plugins ?? []) {
    if (Array.isArray(plugin)) {
      names.push(...flattenPluginNames(plugin));
    } else if (isPlugin(plugin)) {
      names.push(plugin.name);
    }
  }

  return names;
}

function isVitestBrowserServer(config: UserConfig): boolean {
  return (
    isVitestBrowserEnabled(config) || flattenPluginNames(config.plugins).includes("vitest:browser")
  );
}

function isVitestBrowserEnabled(config: UserConfig): boolean {
  const browser = (
    config as UserConfig & {
      test?: { browser?: boolean | { enabled?: boolean } };
    }
  ).test?.browser;

  if (typeof browser === "boolean") {
    return browser;
  }

  return browser?.enabled === true;
}

function disableOptimizer(config: UserConfig, environmentName: string): void {
  const environment = (config.environments ??= {})[environmentName];
  if (!environment) return;

  const optimizeDeps = (environment.optimizeDeps ??= {});
  optimizeDeps.noDiscovery = true;
  optimizeDeps.include = [];
  optimizeDeps.entries = [];
}

async function findReactClientEntries(root = process.cwd()) {
  const entries: string[] = [];

  for (const entryRoot of reactClientEntryRoots) {
    const absoluteEntryRoot = path.resolve(root, entryRoot);
    if (!(await isDirectory(absoluteEntryRoot))) {
      continue;
    }

    for await (const file of walkFiles(absoluteEntryRoot)) {
      if (await hasUseClientDirective(file)) {
        entries.push(toRootRelativePath(root, file));
      }
    }
  }

  entries.sort();
  return entries.length ? entries : undefined;
}

async function isDirectory(directory: string) {
  try {
    return (await fs.stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

async function* walkFiles(directory: string): AsyncGenerator<string> {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (ignoredEntryDirectories.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(absolutePath);
    } else if (reactClientEntryExtensions.has(path.extname(entry.name))) {
      yield absolutePath;
    }
  }
}

async function hasUseClientDirective(file: string) {
  return scanDirectivePrologue(await fs.readFile(file, "utf8")).includes("use client");
}

function scanDirectivePrologue(source: string) {
  const directives: string[] = [];
  let index = source.charCodeAt(0) === 0xfeff ? 1 : 0;

  while (index < source.length) {
    index = skipWhitespaceAndComments(source, index).index;

    const quote = source[index];
    if (quote !== '"' && quote !== "'") {
      break;
    }

    const parsed = readStringLiteral(source, index, quote);
    if (!parsed) {
      break;
    }

    const afterLiteral = skipWhitespaceAndComments(source, parsed.end);
    if (source[afterLiteral.index] === ";") {
      index = afterLiteral.index + 1;
    } else if (!afterLiteral.hasLineTerminator && afterLiteral.index < source.length) {
      break;
    } else {
      index = afterLiteral.index;
    }

    directives.push(parsed.value);
  }

  return directives;
}

function skipWhitespaceAndComments(source: string, index: number) {
  let hasLineTerminator = false;

  while (index < source.length) {
    const char = source[index];

    if (char === " " || char === "\t") {
      index += 1;
      continue;
    }

    if (char === "\n" || char === "\r") {
      hasLineTerminator = true;
      index += 1;
      continue;
    }

    if (source.startsWith("//", index)) {
      const lineEnd = source.indexOf("\n", index + 2);
      hasLineTerminator = true;
      index = lineEnd === -1 ? source.length : lineEnd + 1;
      continue;
    }

    if (source.startsWith("/*", index)) {
      const commentEnd = source.indexOf("*/", index + 2);
      const comment = source.slice(index, commentEnd === -1 ? undefined : commentEnd);
      hasLineTerminator ||= comment.includes("\n") || comment.includes("\r") || commentEnd === -1;
      index = commentEnd === -1 ? source.length : commentEnd + 2;
      continue;
    }

    break;
  }

  return { index, hasLineTerminator };
}

function readStringLiteral(source: string, start: number, quote: string) {
  let value = "";

  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];

    if (char === quote) {
      return { value, end: index + 1 };
    }

    if (char === "\\") {
      if (index + 1 >= source.length) {
        break;
      }
      value += source[index + 1];
      index += 1;
      continue;
    }

    if (char === "\n" || char === "\r") {
      break;
    }

    value += char;
  }

  return undefined;
}

function toRootRelativePath(root: string, file: string) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}
