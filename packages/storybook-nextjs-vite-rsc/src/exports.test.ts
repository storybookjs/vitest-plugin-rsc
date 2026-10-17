import { expect, expectTypeOf, test } from "vitest";
import * as framework from "@storybook/nextjs-vite-rsc";
import type { FrameworkOptions } from "@storybook/nextjs-vite-rsc";
import { preset } from "@storybook/nextjs-vite-rsc/preset";
import { preview } from "@storybook/nextjs-vite-rsc/preview";
import { storybookNextjsViteRsc } from "@storybook/nextjs-vite-rsc/vite-plugin";

// The package is a skeleton. Its entry points resolve through its exports,
// to the source with `pnpm test` and to the build with `pnpm test:dist`, and
// export their placeholders.
test("the entry points export their placeholders", () => {
  expect(Object.keys(framework)).toEqual([]);
  expectTypeOf<FrameworkOptions>().toEqualTypeOf<Record<string, never>>();
  expect(preset).toEqual({});
  expect(preview).toEqual({});
  expect(storybookNextjsViteRsc()).toEqual([]);
});
