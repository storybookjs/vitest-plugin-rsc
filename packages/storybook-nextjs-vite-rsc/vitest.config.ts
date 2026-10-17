import { fileURLToPath } from "node:url";
import { defaultServerConditions } from "vite";
import { defineProject } from "vitest/config";
import {
  storybookNextjsViteRscSourceConditions,
  vitestPluginRscSourceConditions,
} from "../../vitest.conditions.ts";

export default defineProject({
  root: fileURLToPath(new URL("./", import.meta.url)),
  // The tests run in Node, where Vite resolves with the conditions of SSR.
  ssr: {
    resolve: {
      conditions: [
        ...vitestPluginRscSourceConditions,
        ...storybookNextjsViteRscSourceConditions,
        ...defaultServerConditions,
      ],
    },
  },
  test: {
    name: "storybook-nextjs-vite-rsc",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
