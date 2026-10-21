import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineProject } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext, type NextBuild } from "vitest-plugin-rsc/nextjs/plugin";
import { vitestPluginRscSourceConditions } from "../../vitest.conditions.ts";
import { writePgliteFiles } from "./test/pglite-files.ts";

// The data dir and files of PGlite: see test/pglite-files.ts.
await writePgliteFiles();

export default defineProject({
  root: fileURLToPath(new URL("./", import.meta.url)),
  resolve: {
    conditions: vitestPluginRscSourceConditions,
    // The drivers of the app's database servers, which need Node.js, and which
    // the ORMs import whether or not they make a pool: see test/drivers/.
    alias: [
      {
        find: /^mysql2(\/promise)?$/,
        replacement: fileURLToPath(new URL("./test/drivers/mysql2.ts", import.meta.url)),
      },
      {
        find: /^mariadb$/,
        replacement: fileURLToPath(new URL("./test/drivers/mariadb.ts", import.meta.url)),
      },
    ],
  },
  // lite4mariadb runs MariaDB on threads, which a page has when it is
  // isolated from other origins: SharedArrayBuffer.
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    },
  },
  optimizeDeps: {
    // What the files in __mocks__/ import, which no file that Vite scans for
    // dependencies imports: found while the tests run, they would make Vite
    // optimize again, and reload the tests.
    include: [
      "@prisma/adapter-libsql/web",
      "@prisma/adapter-mariadb",
      "@prisma/adapter-pg",
      "@electric-sql/pglite",
      "pg",
      "drizzle-orm/node-postgres",
      "kysely",
      "kysely/migration",
      "@libsql/kysely-libsql",
      "drizzle-orm/libsql/wasm",
      "drizzle-orm/mysql2",
    ],
    // They load their WebAssembly and workers from their own URLs, which
    // pre-bundled files do not have.
    exclude: ["lite4mariadb", "@libsql/client-wasm", "@libsql/libsql-wasm-experimental"],
  },
  plugins: [
    vitestPluginRSC(),
    vitestPluginNext({
      // oxlint-disable-next-line no-process-env
      build: (process.env.VITEST_PLUGIN_RSC_BUILD || "development") as NextBuild,
    }),
  ],
  test: {
    name: "nextjs-db-recipes",
    include: ["**/*.test.{ts,tsx}"],
    browser: {
      enabled: true,
      headless: true,
      // A time zone of the page that is not UTC, as the server's is: a value
      // that a driver writes or reads in the wrong one moves by hours.
      provider: playwright({ contextOptions: { timezoneId: "Pacific/Auckland" } }),
      instances: [{ browser: "chromium" }],
    },
    isolate: false,
    setupFiles: ["./vitest.setup.ts"],
  },
});
