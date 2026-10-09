import type { Plugin, ResolvedConfig } from "vite";
import { expect, test } from "vitest";
import { hostPlugins } from "./host-plugins.ts";

type Environment = Parameters<NonNullable<Plugin["applyToEnvironment"]>>[0];
const environment = (name: string) => ({ name }) as Environment;

test("keeps the plugins of the host in its own environment, the rsc layer", () => {
  const preview: Plugin = { name: "storybook:code-generator-plugin" };
  const docs: Plugin = { name: "storybook:mdx-plugin" };
  const own: Plugin = { name: "storybook:env-plugin", applyToEnvironment: () => false };
  const app: Plugin = { name: "vite:react" };
  const plugin = hostPlugins([/^storybook:(?!mdx-plugin$)/], "client");

  const configResolved = plugin.configResolved as (config: ResolvedConfig) => void;
  const config = { plugins: [preview, docs, own, app] } as unknown as ResolvedConfig;
  configResolved(config);
  // Once: a config that resolves again keeps them where they are.
  configResolved(config);

  expect(preview.applyToEnvironment?.(environment("client"))).toBe(true);
  expect(preview.applyToEnvironment?.(environment("react_client"))).toBe(false);
  expect(preview.applyToEnvironment?.(environment("next_ssr"))).toBe(false);
  // What a plugin says of itself still holds.
  expect(own.applyToEnvironment?.(environment("client"))).toBe(false);
  // Not one the host names.
  expect(docs.applyToEnvironment).toBeUndefined();
  expect(app.applyToEnvironment).toBeUndefined();
});
