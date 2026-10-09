import { defineConfig } from "vite";
import { vitestPluginRscSourceConditions } from "../../../vitest.conditions.ts";

// The Vite config of Storybook, not the project's `vite.config.ts`, which is
// for Vitest: the framework brings the plugin itself. In this repository, the
// plugin is its source.
export default defineConfig({ resolve: { conditions: vitestPluginRscSourceConditions } });
