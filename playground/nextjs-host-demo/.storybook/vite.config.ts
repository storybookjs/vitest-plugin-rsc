import { defineConfig } from "vite";
import { vitestPluginRscSourceConditions } from "../../../vitest.conditions.ts";

// The Vite config of Storybook. In this repository the plugin is its source
// when the suite runs it.
export default defineConfig({ resolve: { conditions: vitestPluginRscSourceConditions } });
