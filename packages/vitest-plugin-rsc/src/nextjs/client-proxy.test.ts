import fs from "node:fs";
import { createRequire } from "node:module";
import vitePluginRsc, { getPluginApi } from "@vitejs/plugin-rsc/plugin";
import type { Plugin } from "vite";
import { afterEach, expect, test } from "vitest";
import { clientProxy } from "./client-proxy.ts";
import { replaceClientProxies } from "./plugin.ts";
import { registry } from "./registry.ts";

// What Vite RSC makes of a file with "use client" in the rsc layer, by its
// own transform, `rsc:use-client`, as it runs in the rsc layer of a build:
// the module, and what Vite RSC says of it.
async function viteRscReferenceModule(code: string) {
  const plugins = (vitePluginRsc() as unknown[]).flat(Infinity) as Plugin[];
  const { manager } = getPluginApi({ plugins: plugins as never })!;
  Object.assign(manager, { config: { root: "/project" } });
  const transform = plugins.find(({ name }) => name === "rsc:use-client")!.transform as {
    handler(this: object, code: string, id: string): Promise<{ code: string }>;
  };
  const context = {
    environment: { name: "rsc", mode: "build" },
    error(error: unknown) {
      throw error;
    },
    warn() {},
  };
  const { code: output } = await transform.handler.call(context, code, id);
  return { code: output, reference: manager.clientReferenceMetaMap[id]! };
}

const id = "/project/app/a.tsx";
const file = `"use client";\nexport function A() {}\nexport default function B() {}\nexport const C = 1;\n`;

test("gives every export of Vite RSC's client reference module the plugin's proxy", async () => {
  const { code, reference } = await viteRscReferenceModule(file);
  const { referenceKey: key, exportNames } = reference;
  expect(exportNames).toEqual(["A", "default", "C"]);

  const replaced = await replaceClientProxies(code, reference, id);

  expect(replaced).not.toContain("throw new Error");
  for (const name of exportNames) {
    expect(replaced).toMatch(
      new RegExp(
        String.raw`registerClientReference\(\s*\$\$clientProxy\("${key}", "${name}"\),\s*"${key}",\s*"${name}"\)`,
      ),
    );
  }
  expect(replaced).toMatch(
    /^import \{ clientProxy as \$\$clientProxy \} from ".*client-proxy\.ts";/,
  );
});

test('leaves a module with "use client" and no exports as it is', async () => {
  const { code, reference } = await viteRscReferenceModule(`"use client";\nimport "./a.css";\n`);

  expect(await replaceClientProxies(code, reference, id)).toBe(code);
});

test("fails for a module without a reference of React's API for each export", async () => {
  const { code, reference } = await viteRscReferenceModule(file);
  const { referenceKey: key } = reference;
  const replace = (module: string, exportNames = reference.exportNames) =>
    replaceClientProxies(module, { ...reference, exportNames }, id);
  const fails = `Vite RSC made of ${id} is not one that the plugin knows`;

  await expect(replace(code, [...reference.exportNames, "D"])).rejects.toThrow(
    `${fails}: references for ["A","C","default"], and the exports ["A","C","D","default"]`,
  );
  // A reference twice, and another one not at all.
  await expect(replace(code.replace(/"C"\)/, '"A")'))).rejects.toThrow(
    'references for ["A","A","default"]',
  );
  await expect(replace(code.replaceAll("registerClientReference(", "reference("))).rejects.toThrow(
    "references for [], and the exports",
  );
  const otherReference = `a reference that is not registerClientReference(proxy, "${key}", name)`;
  await expect(replace(code.replace(/"A"\)/, "name)"))).rejects.toThrow(otherReference);
  await expect(replace(code.replace(`"${key}"`, '"elsewhere"'))).rejects.toThrow(otherReference);
});

test("depends on the one version of Vite RSC whose client reference modules it knows", () => {
  const own = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  const installed = createRequire(import.meta.url)("@vitejs/plugin-rsc/package.json").version;
  expect(own.dependencies["@vitejs/plugin-rsc"]).toBe("0.5.36");
  expect(installed).toBe("0.5.36");
});

afterEach(() => {
  delete registry.renderClientReference;
});

test("hands rendering to the renderer of the tab, and throws when it is called", () => {
  const Badge = clientProxy("/app/badge.tsx", "Badge");
  // Named after the export, for React's component stacks.
  expect(Badge.name).toBe("Badge");
  const called = "/app/badge.tsx#Badge is a Client Component and cannot be called on the server";
  // Before the tab has a renderer, which a host that renders server JSX has.
  expect(() => Badge({})).toThrow(called);

  const rendered: unknown[] = [];
  registry.renderClientReference = (...args) => rendered.push(args);
  Badge({ tone: "dark" });
  expect(rendered).toEqual([["/app/badge.tsx", "Badge", { tone: "dark" }]]);
  // Called by server code with what is not props.
  expect(() => (Badge as (value: unknown) => unknown)("dark")).toThrow(called);
});
