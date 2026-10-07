import fs from "node:fs";
import path from "node:path";
import { normalizePath, parseAstAsync, type Plugin } from "vite";

// Vite adds an import of its client, `/@vite/client`, to a module that uses
// `import.meta.hot`, to CSS, which the client puts in the document, and to a
// module with a dynamic import it cannot analyse, like the one that loads a
// Client Component by its id (testing-library-client.tsx).
//
// A page has one such client, with one websocket to the dev server, and finds
// that server by the URL it was loaded from. A module runner would evaluate
// another copy for every module graph it creates. Such a copy has a file URL,
// so it falls back to the address Vite wrote into it: the port the server was
// configured with, written before the server listens. When that port is taken,
// say by another Vitest run, the server listens on the next free one, and the
// copy connects to the other run's server. That one refuses it, which Vite's
// client reports with `console.error`, or drops it later, on which Vite's
// client reloads the tab.
//
// So the environments that load through a module runner get the client of the
// page, and nothing in the page depends on a port that was known up front.

/** The page's own instance of Vite's client. */
const pageViteClientId = "virtual:vitest-plugin-rsc/vite-client";
/** Where the page keeps it for its module runners, see utilts.ts. */
const pageViteClientGlobal = "globalThis.__vitest_plugin_rsc_vite_client__";

export function pageViteClientPlugin(): Plugin {
  return {
    name: "rsc:page-vite-client",
    enforce: "pre",
    resolveId(source) {
      if (source === pageViteClientId) return `\0${pageViteClientId}`;
    },
    async load(id) {
      if (id === `\0${pageViteClientId}`) {
        // A static import of the URL that Vite itself writes into modules, so
        // the browser gives the instance it already has. A dynamic import
        // would get a query from Vite, and with it a second instance.
        const url = path.posix.join(this.environment.config.base, "/@vite/client");
        return `export * from ${JSON.stringify(url)};`;
      }

      // The page loads `client` itself, and every other environment for a
      // browser through a module runner.
      const { name, config } = this.environment;
      if (name === "client" || config.consumer !== "client") return;
      // Vite resolves `/@vite/client` to this file itself, with an alias.
      const file = id.split("?")[0]!;
      if (!normalizePath(file).endsWith("/vite/dist/client/client.mjs")) return;
      const names = await exportNames(fs.readFileSync(file, "utf8"));
      return (
        `const client = ${pageViteClientGlobal};\n` +
        names.map((name) => `export const ${name} = client.${name};`).join("\n")
      );
    },
  };
}

// What this version of Vite's client exports, read from the file itself.
async function exportNames(code: string): Promise<string[]> {
  const names: string[] = [];
  for (const node of (await parseAstAsync(code)).body) {
    if (node.type !== "ExportNamedDeclaration") continue;
    for (const specifier of node.specifiers) {
      if (specifier.exported.type === "Identifier") names.push(specifier.exported.name);
    }
    const declaration = node.declaration;
    if (declaration?.type === "FunctionDeclaration" || declaration?.type === "ClassDeclaration") {
      if (declaration.id) names.push(declaration.id.name);
    } else if (declaration?.type === "VariableDeclaration") {
      for (const { id } of declaration.declarations) {
        if (id.type === "Identifier") names.push(id.name);
      }
    }
  }
  return names;
}
