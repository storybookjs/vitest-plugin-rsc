import fs from "node:fs";
import path from "node:path";
import { normalizePath, parseAstAsync, type Plugin } from "vite";

// Vite adds an import of its client, `/@vite/client`, to a module that uses
// `import.meta.hot`, to CSS, which the client puts in the document, and to a
// module with a dynamic import it cannot analyse, like the one that loads a
// Client Component by its id (client-modules.ts).
//
// A page has one such client, with one websocket to the dev server. A module
// runner would evaluate another copy for every module graph it creates. Such a
// copy has no page URL to read the address of the dev server off, so it falls
// back to the port the server was configured with, which is not the port it
// listens on when that one was taken. That can be the dev server of another
// project, and a copy reloads the tab when that server goes away.
//
// So the layers that load through a module runner get the client of the page.

/** The page's own instance of Vite's client, for the layer the page loads. */
export const pageViteClientId = "virtual:vitest-plugin-rsc/next-vite-client";

export function pageViteClientPlugin(registry: string, runnerEnvironments: string[]): Plugin {
  return {
    name: "vitest-plugin-rsc:next-vite-client",
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

      if (!runnerEnvironments.includes(this.environment.name)) return;
      // Vite resolves `/@vite/client` to this file itself, with an alias.
      const file = id.split("?")[0]!;
      if (!normalizePath(file).endsWith("/vite/dist/client/client.mjs")) return;
      const names = await exportNames(fs.readFileSync(file, "utf8"));
      return (
        `const client = ${registry}.viteClient;\n` +
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
