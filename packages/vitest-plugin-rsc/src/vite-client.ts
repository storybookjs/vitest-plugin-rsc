import fs from "node:fs";
import path from "node:path";
import { parseAstAsync, type Plugin } from "vite";

// Vite adds an import of its client, `/@vite/client`, to a module that uses
// `import.meta.hot`, to CSS, and to a module with a dynamic import it cannot
// analyse, like the one that loads a Client Component by its id
// (testing-library-client.tsx).
//
// The page's client finds the dev server by the URL it was loaded from. A copy
// that a module runner evaluates has a file URL, so it falls back to the port
// Vite wrote into it before the server listened: the configured one. When that
// port was taken, say by another Vitest run, that is the other run's server,
// which refuses the copy. Vite's client reports that with `console.error`, and
// reloads the page when a replaced `WebSocket` (MSW's) first reported `open`.
//
// So an environment that loads through a module runner gets the page's client.

/** The page's own instance of Vite's client. */
const pageViteClientId = "virtual:vitest-plugin-rsc/vite-client";
/** Where the page keeps it for its module runners, see utils.ts. */
const pageViteClientGlobal = "globalThis.__vitest_plugin_rsc_vite_client__";

export function pageViteClientPlugin(): Plugin {
  let clientFile: string | undefined;
  return {
    name: "rsc:page-vite-client",
    enforce: "pre",
    resolveId(source) {
      if (source === pageViteClientId) return `\0${pageViteClientId}`;
    },
    async load(id) {
      if (id === `\0${pageViteClientId}`) {
        // A build has no client of Vite.
        if (this.environment.mode !== "dev") return "export {};";
        // A static import of the URL that Vite itself writes into modules, so
        // the browser gives the instance it already has. A dynamic import
        // would get a query from Vite, and with it a second instance.
        const url = path.posix.join(this.environment.config.base, "/@vite/client");
        return `export * from ${JSON.stringify(url)};`;
      }

      // The environments this plugin runs in the page through a module runner.
      const { consumer, dev } = this.environment.config;
      if (this.environment.mode !== "dev") return;
      if (consumer !== "client" || !dev.moduleRunnerTransform) return;
      clientFile ??= (await this.resolve("/@vite/client"))?.id;
      if (id !== clientFile) return;
      const names = (await parseAstAsync(fs.readFileSync(id, "utf8"))).body.flatMap((node) =>
        node.type === "ExportNamedDeclaration"
          ? node.specifiers.map(({ exported }) => (exported as { name: string }).name)
          : [],
      );
      if (names.length === 0) throw new Error(`Found no exports in Vite's client, ${id}.`);
      return (
        `const client = ${pageViteClientGlobal};\n` +
        `if (!client) throw new Error("vitest-plugin-rsc: the page has no Vite client to share.");\n` +
        names.map((name) => `export const ${name} = client.${name};`).join("\n")
      );
    },
  };
}
