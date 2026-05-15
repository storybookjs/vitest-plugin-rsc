import { defineProject, mergeConfig } from "vitest/config";
import sharedConfig from "./vitest.shared";

export default mergeConfig(
  sharedConfig,
  defineProject({
    test: {
      name: "nextjs-notes-demo-node",
      include: ["**/*.node.test.ts"],
      exclude: ["node_modules"],
      environment: "node",
      setupFiles: ["./vitest.setup.node.ts"],
    },
  }),
);
