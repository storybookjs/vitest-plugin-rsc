import { normalizePath, type Plugin } from "vite";

// Vite adds an import of its client, `/@vite/client`, to modules that use
// `import.meta.hot` and to CSS, which the client puts in the document.
//
// A page has one such client, with one websocket to the dev server. A module
// runner would evaluate another copy for every module graph it creates. Such a
// copy has no page URL to read the address of the dev server off, so it falls
// back to the port the server was configured with, which is not the port it
// listens on when that one was taken. That can be the dev server of another
// project, and a copy reloads the tab when that server goes away.
//
// So the layers that load through a module runner get the client of the page.
const viteClientExports = [
  "createHotContext",
  "updateStyle",
  "removeStyle",
  "injectQuery",
  "ErrorOverlay",
];

export function pageViteClientPlugin(registry: string, environments: string[]): Plugin {
  return {
    name: "vitest-plugin-rsc:next-vite-client",
    enforce: "pre",
    applyToEnvironment: (environment) => environments.includes(environment.name),
    // Vite resolves `/@vite/client` to this file itself, with an alias.
    load(id) {
      if (!normalizePath(id.split("?")[0]!).endsWith("/vite/dist/client/client.mjs")) return;
      return (
        `const client = ${registry}.viteClient;\n` +
        viteClientExports.map((name) => `export const ${name} = client.${name};`).join("\n")
      );
    },
  };
}
