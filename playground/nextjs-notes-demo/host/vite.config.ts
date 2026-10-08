import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { defineConfig, type Plugin } from "vite";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";
import { vitestPluginRscSourceConditions } from "../../../vitest.conditions.ts";
import * as schema from "../db/schema.ts";

// The notes app in a page of Vite, without Vitest: with a dev server and as a
// static build. `main.tsx` is what `vitest.setup.ts` and a test file are to
// the tests.
const root = fileURLToPath(new URL("../", import.meta.url));

// Google Fonts, without the network: see the file.
// oxlint-disable-next-line no-process-env
process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES = fileURLToPath(
  new URL("../../../vitest.google-fonts.cjs", import.meta.url),
);

// What `vitest.setup.ts` mocks with `vi.mock()`, for a host that has none.
// The database and the session are the host's to set, and the auth server is
// not in the browser.
const standIns: Record<string, string> = {
  "#lib/db.ts": "lib/__mocks__/db.ts",
  "#lib/auth-session.ts": "lib/__mocks__/auth-session.ts",
  "#lib/auth.ts": "host/auth.ts",
};
const schemaSqlId = "virtual:nextjs-notes-demo/schema-sql";

function hostModules(): Plugin {
  return {
    name: "nextjs-notes-demo:host-modules",
    enforce: "pre",
    resolveId(source) {
      if (source === schemaSqlId) return `\0${schemaSqlId}`;
      const standIn = standIns[source];
      if (standIn) return path.join(root, standIn);
    },
    // The schema of the database as SQL, which `vitest.global-setup.ts` makes
    // for the tests.
    async load(id) {
      if (id !== `\0${schemaSqlId}`) return;
      const statements = await generateMigration(
        generateDrizzleJson({}),
        generateDrizzleJson(schema),
      );
      return `export default ${JSON.stringify(statements.join("\n"))};\n`;
    },
  };
}

export default defineConfig({
  root,
  plugins: [hostModules(), vitestPluginRSC(), vitestPluginNext({ host: { files: ["host/**"] } })],
  resolve: {
    tsconfigPaths: true,
    conditions: vitestPluginRscSourceConditions,
  },
  build: { rolldownOptions: { input: path.join(root, "host/index.html") } },
});
