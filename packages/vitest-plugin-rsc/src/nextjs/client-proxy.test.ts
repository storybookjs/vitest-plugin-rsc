import fs from "node:fs";
import { createRequire } from "node:module";
import { transformDirectiveProxyExport } from "@vitejs/plugin-rsc/transforms";
import { parseAstAsync } from "vite";
import { expect, test } from "vitest";
import { replaceClientProxies } from "./plugin.ts";

// What Vite RSC 0.5.36 makes of a file with "use client" in the rsc layer: its
// runtime, as plugin-*.js of the package has it.
async function viteRscReferenceModule(code: string, proxy = viteRscProxy) {
  const result = transformDirectiveProxyExport(await parseAstAsync(code), {
    directive: "use client",
    code,
    runtime: (name) =>
      `$$ReactServer.registerClientReference(  ${proxy(name)},  ${JSON.stringify("/app/a.tsx")},  ${JSON.stringify(name)})`,
  });
  return { code: result!.output.toString(), exportNames: result!.exportNames };
}
const viteRscProxy = (name: string) =>
  `() => { throw new Error("Unexpectedly client reference export '" + ` +
  JSON.stringify(name) +
  ` + "' is called on server") }`;

const file = `"use client";\nexport function A() {}\nexport default function B() {}\nexport const C = 1;\n`;

test("gives every export of Vite RSC's client reference module the plugin's proxy", async () => {
  const { code, exportNames } = await viteRscReferenceModule(file);
  const replaced = replaceClientProxies(code, exportNames, "/app/a.tsx");
  expect(replaced).not.toContain("throw new Error");
  for (const name of ["A", "default", "C"]) {
    expect(replaced).toContain(
      `$$clientProxy("/app/a.tsx", "${name}"), "/app/a.tsx", "${name}")`,
    );
  }
});

test("fails when Vite RSC makes another proxy", async () => {
  const { code, exportNames } = await viteRscReferenceModule(
    file,
    (name) => `() => { throw new Error(${JSON.stringify(`${name} is client code`)}) }`,
  );
  expect(() => replaceClientProxies(code, exportNames, "/app/a.tsx")).toThrow(
    /is not the one of @vitejs\/plugin-rsc 0\.5\.36: 0 of 3 replaced/,
  );
});

test("fails when it finds fewer proxies than exports", async () => {
  const { code } = await viteRscReferenceModule(file);
  expect(() => replaceClientProxies(code, ["A", "default", "C", "D"], "/app/a.tsx")).toThrow(
    /3 of 4 replaced/,
  );
});

test("depends on the one version of Vite RSC whose proxy it replaces", () => {
  const own = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  const installed = createRequire(import.meta.url)("@vitejs/plugin-rsc/package.json").version;
  expect(own.dependencies["@vitejs/plugin-rsc"]).toBe("0.5.36");
  expect(installed).toBe("0.5.36");
});
