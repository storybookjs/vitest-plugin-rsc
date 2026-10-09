import { fileURLToPath } from "node:url";
import { defineMain } from "@storybook/nextjs-vite-rsc/node";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "../db/schema.ts";

// Google Fonts, without the network: as in vitest.config.ts.
// oxlint-disable-next-line no-process-env
process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES = fileURLToPath(
  new URL("../../../vitest.google-fonts.cjs", import.meta.url),
);

export default defineMain({
  stories: ["../app/**/*.stories.tsx", "../components/**/*.stories.tsx"],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "@storybook/nextjs-vite-rsc",
    options: {
      // Not the `vite.config.ts` of the project, which is for Vitest.
      builder: { viteConfigPath: ".storybook/vite.config.ts" },
      // MSW, which preview.ts starts, reads the storage of the page: it is
      // not server code. Vitest serves it as it is.
      browserModules: ["**/node_modules/msw/**", "**/node_modules/@mswjs/**"],
    },
  },
  // MSW's worker, for the service that the cache probe fetches from: as in
  // vitest.config.ts.
  staticDirs: [{ from: "../../../public", to: "/" }],
  // The SQL of the schema, for the database that preview.ts makes in the
  // browser: what vitest.global-setup.ts provides to the tests.
  async viteFinal(config) {
    const statements = await generateMigration(
      generateDrizzleJson({}),
      generateDrizzleJson(schema),
    );
    return {
      ...config,
      define: { ...config.define, __SCHEMA_SQL__: JSON.stringify(statements.join("\n")) },
    };
  },
});
