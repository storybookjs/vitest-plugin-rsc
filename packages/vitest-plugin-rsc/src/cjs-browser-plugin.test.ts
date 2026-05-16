import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Plugin } from "vite";
import { parseAstAsync } from "vite";
import { expect, test } from "vitest";
import {
  cjsBrowserPlugin,
  transformCjsToBrowserEsm,
  type CjsBrowserPluginOptions,
} from "./cjs-browser-plugin.ts";

test("transforms use-client CommonJS into browser ESM with upstream-style require interop", async () => {
  const id = path.join(os.tmpdir(), "node_modules/example/button.cjs");
  const code = `
"use client";
const React = require("react");
function Button() {
  return React.createElement("button");
}
exports.Button = Button;
exports.default = Button;
`;
  const ast = await parseAstAsync(code, { lang: "js" }, id);

  const result = await transformCjsToBrowserEsm(code, ast, { id });
  const output = result.output.toString();

  expect(output).toContain('"use client";');
  expect(output).toContain('(__cjs_interop__(await import("react")))');
  expect(output).toContain("var exports = {}; var module = { exports };");
  expect(output).toContain("export default __cjs_default__;");
  expect(output).toContain("export { Button };");
  expect(output).toContain("export const __cjs_module_runner_transform = true;");
});

test("does not rewrite a locally declared require identifier", async () => {
  const id = path.join(os.tmpdir(), "node_modules/example/local-require.cjs");
  const code = `
"use client";
function getValue() {
  const require = () => "local";
  return require("not-a-module");
}
exports.getValue = getValue;
`;
  const ast = await parseAstAsync(code, { lang: "js" }, id);

  const result = await transformCjsToBrowserEsm(code, ast, { id });
  const output = result.output.toString();

  expect(output).not.toContain('await import("not-a-module")');
  expect(output).toContain("export { getValue };");
});

test("rewrites top-level and nested CommonJS requires like upstream", async () => {
  const id = path.join(os.tmpdir(), "node_modules/example/nested.cjs");
  const code = `
"use client";
if (process.env.NODE_ENV === "production") {
  module.exports = require("./production.cjs");
} else {
  module.exports = require("./development.cjs");
}
function load() {
  const React = require("react");
  return React;
}
`;
  const ast = await parseAstAsync(code, { lang: "js" }, id);

  const result = await transformCjsToBrowserEsm(code, ast, { id });
  const output = result.output.toString();

  expect(output).toContain('(__cjs_interop__(await import("./production.cjs")))');
  expect(output).toContain('(__cjs_interop__(await import("./development.cjs")))');
  expect(output).toContain('const __cjs_to_esm_hoist_0 = __cjs_interop__(await import("react"));');
  expect(output).toContain("const React = __cjs_to_esm_hoist_0;");
});

test("does not unwrap partially initialized ESM namespaces to undefined", async () => {
  const id = path.join(os.tmpdir(), "node_modules/example/circular.cjs");
  const code = `
const cache = require("./cache");
exports.value = cache.getStaleTimeMs;
`;
  const ast = await parseAstAsync(code, { lang: "js" }, id);

  const result = await transformCjsToBrowserEsm(code, ast, { id });
  const output = result.output.toString();

  expect(output).toContain('function __cjs_interop__(m) {return m && typeof m === "object"');
  expect(output).toContain("m.default != null");
});

test("does not treat shadowed require parameters as CommonJS requires", async () => {
  const id = path.join(os.tmpdir(), "node_modules/example/shadowed-parameter.cjs");
  const code = `
"use client";
const React = require("react");
function load(require) {
  return require("local-only");
}
exports.load = load;
`;
  const ast = await parseAstAsync(code, { lang: "js" }, id);

  const result = await transformCjsToBrowserEsm(code, ast, { id });
  const output = result.output.toString();

  expect(output).toContain('(__cjs_interop__(await import("react")))');
  expect(output).toContain('return require("local-only");');
  expect(output).not.toContain('await import("local-only")');
});

test("transforms non-optimized CommonJS dependencies and proxies direct use-client boundaries", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-cjs-"));
  try {
    const packageRoot = path.join(root, "node_modules/example");
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.writeFileSync(path.join(packageRoot, "package.json"), '{"type":"commonjs"}');
    const clientFile = path.join(packageRoot, "client.cjs");
    const parentFile = path.join(packageRoot, "parent.cjs");
    const grandparentFile = path.join(packageRoot, "grandparent.cjs");
    const serverFile = path.join(packageRoot, "server.cjs");
    fs.writeFileSync(
      clientFile,
      '// package banner\n"use client";\nexports.Client = function Client() {};',
    );
    fs.writeFileSync(
      parentFile,
      'const client = require("./client.cjs");\nexports.Client = client.Client;',
    );
    fs.writeFileSync(
      grandparentFile,
      'const parent = require("./parent.cjs");\nexports.Client = parent.Client;',
    );
    fs.writeFileSync(serverFile, 'const path = require("node:path");\nexports.join = path.join;');

    const plugin = findPlugin("rsc:cjs-browser-transform");
    const resolveId = getHookHandler(plugin.resolveId);
    const load = getHookHandler(plugin.load);
    const context = {
      environment: {
        name: "client",
        config: { cacheDir: path.join(root, "node_modules/.vite") },
      },
      resolve: async (source: string) => ({ id: source, external: false }),
    };

    const clientId = (await resolveId.call(context as never, clientFile, undefined, {
      isEntry: false,
    })) as string;
    const parentId = (await resolveId.call(context as never, parentFile, undefined, {
      isEntry: false,
    })) as string;
    const grandparentId = (await resolveId.call(context as never, grandparentFile, undefined, {
      isEntry: false,
    })) as string;
    const serverId = await resolveId.call(context as never, serverFile, undefined, {
      isEntry: false,
    });
    const nestedClientId = await resolveId.call(context as never, "./client.cjs", parentId, {
      isEntry: false,
    });

    const clientResult = (await load.call(context as never, clientId)) as {
      code: string;
      moduleType?: string;
    };
    const parentResult = (await load.call(context as never, parentId)) as {
      code: string;
      moduleType?: string;
    };
    const grandparentResult = (await load.call(context as never, grandparentId)) as {
      code: string;
      moduleType?: string;
    };

    expect(clientId).toContain("\0rsc:cjs-browser-esm:");
    expect(parentId).toContain("\0rsc:cjs-browser-esm:");
    expect(grandparentId).toContain("\0rsc:cjs-browser-esm:");
    expect(nestedClientId).toBe(clientId);
    expect(serverId).toBeUndefined();
    expect(clientResult.code).toContain("registerClientReference");
    expect(clientResult.code).toContain("/@id/__x00__rsc:cjs-browser-esm:");
    expect(clientResult.code).not.toContain("__cjs_module_runner_transform");
    expect(parentResult.code).toContain("rsc:cjs-browser-esm:");
    expect(parentResult.code).toContain("client.cjs");
    expect(parentResult.moduleType).toBe("js");
    expect(grandparentResult.code).toContain("rsc:cjs-browser-esm:");
    expect(grandparentResult.code).toContain("parent.cjs");
    expect(grandparentResult.moduleType).toBe("js");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("skips non-boundary CommonJS and upstream CJS exclusions", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-cjs-skip-"));
  try {
    const packageRoot = path.join(root, "node_modules/example");
    const esmPackageRoot = path.join(root, "node_modules/esm-package");
    const nextPackageRoot = path.join(root, "node_modules/next/dist/client/components");
    const cacheDir = path.join(root, "node_modules/.vite");
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.mkdirSync(esmPackageRoot, { recursive: true });
    fs.mkdirSync(nextPackageRoot, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(packageRoot, "package.json"), '{"type":"commonjs"}');
    fs.writeFileSync(path.join(esmPackageRoot, "package.json"), '{"type":"module"}');
    fs.writeFileSync(path.join(root, "node_modules/next/package.json"), "{}");

    const unrelatedCjs = path.join(packageRoot, "unrelated.cjs");
    const fauxEsm = path.join(packageRoot, "faux-esm.js");
    const typedEsm = path.join(esmPackageRoot, "clientish.js");
    const mjs = path.join(packageRoot, "clientish.mjs");
    const cached = path.join(cacheDir, "clientish.cjs");
    const nextClientCjs = path.join(nextPackageRoot, "client.cjs");

    const cjsCode = 'const path = require("node:path");\nexports.join = path.join;';
    const fauxEsmCode =
      'import value from "value";\nconst dep = require("dep");\nexports.dep = dep;';
    const clientishCode = '"use client";\nconst React = require("react");\nexports.Client = React;';

    fs.writeFileSync(unrelatedCjs, cjsCode);
    fs.writeFileSync(fauxEsm, fauxEsmCode);
    fs.writeFileSync(typedEsm, clientishCode);
    fs.writeFileSync(mjs, clientishCode);
    fs.writeFileSync(cached, clientishCode);
    fs.writeFileSync(nextClientCjs, clientishCode);

    const transform = getHookHandler(
      findPlugin("rsc:cjs-browser-transform", testNextRuntimeOptions()).transform,
    );
    const context = {
      environment: {
        name: "client",
        config: { cacheDir },
      },
    };

    expect(await transform.call(context as never, cjsCode, unrelatedCjs)).toBeUndefined();
    expect(await transform.call(context as never, fauxEsmCode, fauxEsm)).toBeUndefined();
    expect(await transform.call(context as never, clientishCode, typedEsm)).toBeUndefined();
    expect(await transform.call(context as never, clientishCode, mjs)).toBeUndefined();
    expect(await transform.call(context as never, clientishCode, cached)).toBeUndefined();
    expect(await transform.call(context as never, clientishCode, nextClientCjs)).toBeUndefined();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("allows specific skipped internals to opt into the CJS browser transform", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-cjs-include-"));
  try {
    const nextPackageRoot = path.join(root, "node_modules/next/dist/client/components/builtin");
    const cacheDir = path.join(root, "node_modules/.vite");
    fs.mkdirSync(nextPackageRoot, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(root, "node_modules/next/package.json"), "{}");

    const globalErrorFile = path.join(nextPackageRoot, "global-error.js");
    const globalErrorCode = '"use client";\nexports.default = function GlobalError() {};';
    fs.writeFileSync(globalErrorFile, globalErrorCode);

    const transform = getHookHandler(
      findPlugin("rsc:cjs-browser-transform", {
        boundary: {
          include: (id) => id === globalErrorFile,
        },
      }).transform,
    );
    const context = {
      environment: {
        name: "client",
        config: { cacheDir },
      },
    };

    const result = (await transform.call(context as never, globalErrorCode, globalErrorFile)) as {
      code: string;
      moduleType?: string;
    };

    expect(result.code).toContain("registerClientReference");
    expect(result.code).toContain("rsc:cjs-browser-esm:");
    expect(result.moduleType).toBe("js");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("proxies direct use-client CommonJS exports without executing the module in RSC", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-cjs-proxy-exports-"));
  try {
    const packageRoot = path.join(root, "node_modules/example");
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.writeFileSync(path.join(packageRoot, "package.json"), '{"type":"commonjs"}');

    const clientFile = path.join(packageRoot, "client.js");
    const clientCode = `
"use client";
const expensive = require("./expensive");
Object.defineProperty(exports, "__esModule", { value: true });
Object.defineProperty(exports, "default", {
  enumerable: true,
  get: function() { return Client; }
});
Object.defineProperty(exports, "Client", {
  enumerable: true,
  get: function() { return Client; }
});
function Client() {
  return expensive.value;
}
`;
    fs.writeFileSync(clientFile, clientCode);

    const transform = getHookHandler(
      findPlugin("rsc:cjs-browser-transform", testNextRuntimeOptions()).transform,
    );
    const result = (await transform.call(
      {
        environment: {
          name: "client",
          config: { cacheDir: path.join(root, "node_modules/.vite") },
        },
      } as never,
      clientCode,
      clientFile,
    )) as { code: string; moduleType?: string };

    expect(result.code).toContain("registerClientReference");
    expect(result.code).toContain('export default createClientReference("default");');
    expect(result.code).toContain('export const Client = createClientReference("Client");');
    expect(result.code).not.toContain("expensive");
    expect(result.code).not.toContain("await import");
    expect(result.moduleType).toBe("js");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("applies include while recursively detecting skipped CommonJS parents", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-cjs-recursive-include-"));
  try {
    const nextPackageRoot = path.join(root, "node_modules/next/dist/client/components");
    const cacheDir = path.join(root, "node_modules/.vite");
    fs.mkdirSync(nextPackageRoot, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(root, "node_modules/next/package.json"), "{}");

    const parentFile = path.join(nextPackageRoot, "parent.js");
    const middleFile = path.join(nextPackageRoot, "middle.js");
    const clientFile = path.join(nextPackageRoot, "client.js");
    const parentCode = 'const middle = require("./middle");\nexports.Client = middle.Client;';
    const middleCode = 'const client = require("./client");\nexports.Client = client.Client;';
    const clientCode = '"use client";\nexports.Client = function Client() {};';
    fs.writeFileSync(parentFile, parentCode);
    fs.writeFileSync(middleFile, middleCode);
    fs.writeFileSync(clientFile, clientCode);

    const transform = getHookHandler(
      findPlugin("rsc:cjs-browser-transform", {
        boundary: {
          include: (id) => id.startsWith(nextPackageRoot),
          includeParent: (id) => id.startsWith(nextPackageRoot),
        },
      }).transform,
    );
    const context = {
      environment: {
        name: "client",
        config: { cacheDir },
      },
    };

    const result = (await transform.call(context as never, parentCode, parentFile)) as {
      code: string;
      moduleType?: string;
    };

    expect(result.code).toContain("rsc:cjs-browser-esm:");
    expect(result.code).toContain("middle.js");
    expect(result.code).toContain("export const __cjs_module_runner_transform = true");
    expect(result.moduleType).toBe("js");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("does not transform a Next parent unless includeParent opts it in", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-cjs-next-parent-gate-"));
  try {
    const nextPackageRoot = path.join(root, "node_modules/next/dist/shared/lib/lazy-dynamic");
    const cacheDir = path.join(root, "node_modules/.vite");
    fs.mkdirSync(nextPackageRoot, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(root, "node_modules/next/package.json"), "{}");

    const parentFile = path.join(nextPackageRoot, "loadable.js");
    const clientFile = path.join(nextPackageRoot, "dynamic-bailout-to-csr.js");
    const parentCode =
      'const bailout = require("./dynamic-bailout-to-csr");\nexports.bailout = bailout;';
    const clientCode = '"use client";\nexports.BailoutToCSR = function BailoutToCSR() {};';
    fs.writeFileSync(parentFile, parentCode);
    fs.writeFileSync(clientFile, clientCode);

    const transform = getHookHandler(
      findPlugin("rsc:cjs-browser-transform", {
        exclude: isTestNextInternalDependency,
        boundary: {
          include: (id) => id === clientFile,
        },
      }).transform,
    );
    const context = {
      environment: {
        name: "client",
        config: { cacheDir },
      },
    };

    expect(await transform.call(context as never, parentCode, parentFile)).toBeUndefined();

    const optedInTransform = getHookHandler(
      findPlugin("rsc:cjs-browser-transform", {
        boundary: {
          include: (id) => id === parentFile || id === clientFile,
          includeParent: (id) => id === parentFile,
        },
      }).transform,
    );
    const result = (await optedInTransform.call(context as never, parentCode, parentFile)) as {
      code: string;
    };

    expect(result.code).toContain("rsc:cjs-browser-esm:");
    expect(result.code).toContain("dynamic-bailout-to-csr.js");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("allows referenced Next client boundaries without directly transforming the raw child module", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-cjs-referenced-"));
  try {
    const nextPackageRoot = path.join(root, "node_modules/next/dist/server/app-render");
    const clientPackageRoot = path.join(root, "node_modules/next/dist/client/components");
    const cacheDir = path.join(root, "node_modules/.vite");
    fs.mkdirSync(nextPackageRoot, { recursive: true });
    fs.mkdirSync(clientPackageRoot, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(root, "node_modules/next/package.json"), "{}");

    const parentFile = path.join(nextPackageRoot, "entry-base.js");
    const clientFile = path.join(clientPackageRoot, "layout-router.js");
    const parentCode =
      'const layoutRouter = require("../../client/components/layout-router");\nexports.LayoutRouter = layoutRouter.LayoutRouter;';
    const clientCode = '"use client";\nexports.LayoutRouter = function LayoutRouter() {};';
    fs.writeFileSync(parentFile, parentCode);
    fs.writeFileSync(clientFile, clientCode);

    const plugin = findPlugin("rsc:cjs-browser-transform", {
      exclude: isTestNextInternalDependency,
      boundary: {
        include: (id) => id === parentFile,
        includeParent: (id) => id === parentFile,
        includeReferenced: (id) => id === clientFile,
      },
    });
    const transform = getHookHandler(plugin.transform);
    const context = {
      environment: {
        name: "client",
        config: { cacheDir },
      },
    };

    const parentResult = (await transform.call(context as never, parentCode, parentFile)) as {
      code: string;
    };

    expect(await transform.call(context as never, clientCode, clientFile)).toBeUndefined();
    expect(parentResult.code).toContain("rsc:cjs-browser-esm:");
    expect(parentResult.code).toContain("layout-router.js");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("can rewrite CJS parent require targets without replacing the optimizer module system", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-cjs-rewrite-parent-"));
  try {
    const nextPackageRoot = path.join(root, "node_modules/next/dist/server/app-render");
    const clientPackageRoot = path.join(root, "node_modules/next/dist/client/components");
    const cacheDir = path.join(root, "node_modules/.vite");
    fs.mkdirSync(nextPackageRoot, { recursive: true });
    fs.mkdirSync(clientPackageRoot, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(root, "node_modules/next/package.json"), "{}");

    const parentFile = path.join(nextPackageRoot, "entry-base.js");
    const clientFile = path.join(clientPackageRoot, "layout-router.js");
    const serverFile = path.join(nextPackageRoot, "work-store.js");
    const parentCode = `
const layoutRouter = require("../../client/components/layout-router");
const workStore = require("./work-store");
exports.LayoutRouter = layoutRouter.default;
exports.workStore = workStore;
`;
    const clientCode = '"use client";\nexports.default = function LayoutRouter() {};';
    const serverCode = "exports.workStore = {};";
    fs.writeFileSync(parentFile, parentCode);
    fs.writeFileSync(clientFile, clientCode);
    fs.writeFileSync(serverFile, serverCode);

    const transform = getHookHandler(
      findPlugin("rsc:cjs-browser-transform", {
        boundary: {
          include: (id) => id === parentFile,
          includeParent: (id) => id === parentFile,
          includeReferenced: (id) => id === clientFile,
        },
        optimizer: {
          rewriteParentRequires: true,
        },
      }).transform,
    );
    const result = (await transform.call(
      {
        environment: {
          config: { cacheDir },
        },
      } as never,
      parentCode,
      parentFile,
    )) as { code: string; moduleType?: string };

    expect(result.code).toContain("require");
    expect(result.code).toContain("rsc:cjs-browser-esm:");
    expect(result.code).toContain("layout-router.js");
    expect(result.code).toContain('require("./work-store")');
    expect(result.code).not.toContain("await import");
    expect(result.code).not.toContain("__cjs_module_runner_transform");
    expect(result.moduleType).toBe("js");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("transforms CJS parents to executable ESM in named Vite environments", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-cjs-serve-parent-"));
  try {
    const nextPackageRoot = path.join(root, "node_modules/next/dist/server/app-render");
    const clientPackageRoot = path.join(root, "node_modules/next/dist/client/components");
    const cacheDir = path.join(root, "node_modules/.vite");
    fs.mkdirSync(nextPackageRoot, { recursive: true });
    fs.mkdirSync(clientPackageRoot, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(root, "node_modules/next/package.json"), "{}");

    const parentFile = path.join(nextPackageRoot, "entry-base.js");
    const clientFile = path.join(clientPackageRoot, "layout-router.js");
    const serverFile = path.join(nextPackageRoot, "work-store.js");
    const parentCode = `
const layoutRouter = require("../../client/components/layout-router");
const workStore = require("./work-store");
exports.LayoutRouter = layoutRouter.default;
exports.workStore = workStore;
`;
    const clientCode = '"use client";\nexports.default = function LayoutRouter() {};';
    const serverCode = "exports.workStore = {};";
    fs.writeFileSync(parentFile, parentCode);
    fs.writeFileSync(clientFile, clientCode);
    fs.writeFileSync(serverFile, serverCode);

    const transform = getHookHandler(
      findPlugin("rsc:cjs-browser-transform", {
        boundary: {
          include: (id) => id === parentFile,
          includeParent: (id) => id === parentFile,
          includeReferenced: (id) => id === clientFile,
        },
        optimizer: {
          rewriteParentRequires: true,
        },
      }).transform,
    );
    const result = (await transform.call(
      {
        environment: {
          name: "client",
          config: { cacheDir },
        },
      } as never,
      parentCode,
      parentFile,
    )) as { code: string; moduleType?: string };

    expect(result.code).toContain("var exports = {}; var module = { exports };");
    expect(result.code).toContain("rsc:cjs-browser-esm:");
    expect(result.code).toContain("layout-router.js");
    expect(result.code).toContain('await import("./work-store")');
    expect(result.code).toContain("export const __cjs_module_runner_transform = true");
    expect(result.moduleType).toBe("js");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("does not add TLA to non-client Next CJS utilities required by optimizer parents", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-cjs-next-utility-"));
  try {
    const nextPackageRoot = path.join(root, "node_modules/next/dist/client/components");
    const fallbackRoot = path.join(nextPackageRoot, "http-access-fallback");
    const cacheDir = path.join(root, "node_modules/.vite");
    fs.mkdirSync(fallbackRoot, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(root, "node_modules/next/package.json"), "{}");

    const parentFile = path.join(nextPackageRoot, "navigation.react-server.js");
    const notFoundFile = path.join(nextPackageRoot, "not-found.js");
    const fallbackFile = path.join(fallbackRoot, "http-access-fallback.js");
    const parentCode = 'const notFound = require("./not-found");\nexports.notFound = notFound;';
    const notFoundCode =
      'const fallback = require("./http-access-fallback/http-access-fallback");\nexports.notFound = function notFound() { return fallback; };';
    const fallbackCode = "exports.HTTPAccessErrorStatus = { NOT_FOUND: 404 };";
    fs.writeFileSync(parentFile, parentCode);
    fs.writeFileSync(notFoundFile, notFoundCode);
    fs.writeFileSync(fallbackFile, fallbackCode);

    const transform = getHookHandler(
      findPlugin("rsc:cjs-browser-transform", {
        boundary: {
          include: (id) => id === parentFile || id === notFoundFile || id === fallbackFile,
        },
      }).transform,
    );
    const context = {
      environment: {
        config: { cacheDir },
      },
    };

    expect(await transform.call(context as never, parentCode, parentFile)).toBeUndefined();
    expect(await transform.call(context as never, notFoundCode, notFoundFile)).toBeUndefined();
    expect(await transform.call(context as never, fallbackCode, fallbackFile)).toBeUndefined();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("transforms selected Next CJS utilities in named serve environments", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-cjs-next-runtime-"));
  try {
    const nextPackageRoot = path.join(root, "node_modules/next/dist/client/components");
    const cacheDir = path.join(root, "node_modules/.vite");
    fs.mkdirSync(nextPackageRoot, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(root, "node_modules/next/package.json"), "{}");

    const utilityFile = path.join(nextPackageRoot, "readonly-url-search-params.js");
    const utilityCode =
      'Object.defineProperty(exports, "__esModule", { value: true });\nexports.ReadonlyURLSearchParams = URLSearchParams;';
    fs.writeFileSync(utilityFile, utilityCode);

    const transform = getHookHandler(
      findPlugin("rsc:cjs-browser-transform", testNextRuntimeOptions()).transform,
    );
    const result = (await transform.call(
      {
        environment: {
          name: "client",
          config: { cacheDir },
        },
      } as never,
      utilityCode,
      utilityFile,
    )) as { code: string; moduleType?: string };

    expect(result.code).toContain("var exports = {}; var module = { exports };");
    expect(result.code).toContain(
      'export const ReadonlyURLSearchParams = __cjs_exports__["ReadonlyURLSearchParams"];',
    );
    expect(result.moduleType).toBe("js");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("explicit runtime mode executes even when a CJS file has use-client", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-cjs-runtime-client-"));
  try {
    const packageRoot = path.join(root, "node_modules/example");
    const cacheDir = path.join(root, "node_modules/.vite");
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(packageRoot, "package.json"), '{"type":"commonjs"}');

    const utilityFile = path.join(packageRoot, "runtime.js");
    const utilityCode = '"use client";\nexports.run = function run() {};';
    fs.writeFileSync(utilityFile, utilityCode);

    const transform = getHookHandler(
      findPlugin("rsc:cjs-browser-transform", {
        runtime: {
          include: (id) => id === utilityFile,
        },
      }).transform,
    );
    const result = (await transform.call(
      {
        environment: {
          name: "client",
          config: { cacheDir },
        },
      } as never,
      utilityCode,
      utilityFile,
    )) as { code: string; moduleType?: string };

    expect(result.code).toContain("var exports = {}; var module = { exports };");
    expect(result.code).not.toContain("registerClientReference");
    expect(result.code).toContain('export const run = __cjs_exports__["run"];');
    expect(result.moduleType).toBe("js");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("leaves explicit runtime files to optimizer CJS handling without an environment name", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-cjs-runtime-optimizer-"));
  try {
    const packageRoot = path.join(root, "node_modules/example");
    const cacheDir = path.join(root, "node_modules/.vite");
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(packageRoot, "package.json"), '{"type":"commonjs"}');

    const utilityFile = path.join(packageRoot, "runtime.js");
    const utilityCode = '"use client";\nexports.run = function run() {};';
    fs.writeFileSync(utilityFile, utilityCode);

    const transform = getHookHandler(
      findPlugin("rsc:cjs-browser-transform", {
        boundary: {
          proxy: true,
        },
        runtime: {
          include: (id) => id === utilityFile,
        },
      }).transform,
    );

    expect(
      await transform.call(
        {
          environment: {
            config: { cacheDir },
          },
        } as never,
        utilityCode,
        utilityFile,
      ),
    ).toBeUndefined();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rewrites selected Next runtime utility children back to bare Next ids", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-cjs-next-runtime-child-"));
  try {
    const nextPackageRoot = path.join(root, "node_modules/next/dist/client/components");
    const cacheDir = path.join(root, "node_modules/.vite");
    fs.mkdirSync(nextPackageRoot, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(root, "node_modules/next/package.json"), "{}");

    const utilityFile = path.join(nextPackageRoot, "is-next-router-error.js");
    const childFile = path.join(nextPackageRoot, "redirect-error.js");
    const utilityCode =
      'const redirectError = require("./redirect-error");\nexports.isNextRouterError = function isNextRouterError() { return redirectError; };';
    fs.writeFileSync(utilityFile, utilityCode);
    fs.writeFileSync(childFile, "exports.isRedirectError = function isRedirectError() {};");

    const transform = getHookHandler(
      findPlugin("rsc:cjs-browser-transform", testNextRuntimeOptions()).transform,
    );
    const result = (await transform.call(
      {
        environment: {
          name: "client",
          config: { cacheDir },
        },
      } as never,
      utilityCode,
      utilityFile,
    )) as { code: string; moduleType?: string };

    expect(result.code).toContain("next/dist/client/components/redirect-error.js");
    expect(result.code).not.toContain("redirect-error.js:");
    expect(result.code).toContain(
      'export const isNextRouterError = __cjs_exports__["isNextRouterError"];',
    );
    expect(result.moduleType).toBe("js");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rewrites RSC client bare imports to the Vite RSC vendor alias", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-cjs-rsdw-client-"));
  try {
    const nextPackageRoot = path.join(root, "node_modules/next/dist/client/components");
    const cacheDir = path.join(root, "node_modules/.vite");
    fs.mkdirSync(nextPackageRoot, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(root, "node_modules/next/package.json"), "{}");

    const utilityFile = path.join(nextPackageRoot, "rsdw-client-probe.js");
    const utilityCode =
      'const client = require("react-server-dom-webpack/client");\nexports.createFromReadableStream = client.createFromReadableStream;';
    fs.writeFileSync(utilityFile, utilityCode);

    const transform = getHookHandler(
      findPlugin("rsc:cjs-browser-transform", testNextRuntimeOptions()).transform,
    );
    const clientResult = (await transform.call(
      {
        environment: {
          name: "client",
          config: { cacheDir },
        },
      } as never,
      utilityCode,
      utilityFile,
    )) as { code: string };
    const browserResult = (await transform.call(
      {
        environment: {
          name: "react_client",
          config: { cacheDir },
        },
      } as never,
      utilityCode,
      utilityFile,
    )) as { code: string };

    expect(clientResult.code).toContain("@vitejs/plugin-rsc/vendor/react-server-dom/client.edge");
    expect(browserResult.code).toContain(
      "@vitejs/plugin-rsc/vendor/react-server-dom/client.browser",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("transforms selected Next compiled CJS helpers in named serve environments", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-cjs-next-compiled-"));
  try {
    const compiledRoot = path.join(root, "node_modules/next/dist/compiled/strip-ansi");
    const cacheDir = path.join(root, "node_modules/.vite");
    fs.mkdirSync(compiledRoot, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(root, "node_modules/next/package.json"), "{}");

    const utilityFile = path.join(compiledRoot, "index.js");
    const utilityCode = "module.exports = function stripAnsi(value) { return value; };";
    fs.writeFileSync(utilityFile, utilityCode);

    const transform = getHookHandler(
      findPlugin("rsc:cjs-browser-transform", testNextRuntimeOptions()).transform,
    );
    const result = (await transform.call(
      {
        environment: {
          name: "client",
          config: { cacheDir },
        },
      } as never,
      utilityCode,
      utilityFile,
    )) as { code: string; moduleType?: string };

    expect(result.code).toContain("var exports = {}; var module = { exports };");
    expect(result.code).toContain("export default __cjs_default__;");
    expect(result.moduleType).toBe("js");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("preserves nested server-only requires in selected Next browser utilities", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-cjs-next-nested-"));
  try {
    const nextPackageRoot = path.join(root, "node_modules/next/dist/client/components");
    const serverPackageRoot = path.join(root, "node_modules/next/dist/server/app-render");
    const cacheDir = path.join(root, "node_modules/.vite");
    fs.mkdirSync(nextPackageRoot, { recursive: true });
    fs.mkdirSync(serverPackageRoot, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(root, "node_modules/next/package.json"), "{}");

    const utilityFile = path.join(nextPackageRoot, "navigation-untracked.js");
    const serverFile = path.join(serverPackageRoot, "work-unit-async-storage.external.js");
    const utilityCode = `
const React = require("react");
exports.useUntrackedPathname = function useUntrackedPathname() {
  if (typeof window === "undefined") {
    return require("../../server/app-render/work-unit-async-storage.external");
  }
  return React.useContext({});
};
`;
    fs.writeFileSync(utilityFile, utilityCode);
    fs.writeFileSync(serverFile, "exports.workUnitAsyncStorage = {};");

    const transform = getHookHandler(
      findPlugin("rsc:cjs-browser-transform", testNextRuntimeOptions()).transform,
    );
    const result = (await transform.call(
      {
        environment: {
          name: "client",
          config: { cacheDir },
        },
      } as never,
      utilityCode,
      utilityFile,
    )) as { code: string; moduleType?: string };

    expect(result.code).toContain('await import("react")');
    expect(result.code).toContain(
      'require("../../server/app-render/work-unit-async-storage.external")',
    );
    expect(result.code).not.toContain("work-unit-async-storage.external.js:");
    expect(result.code).toContain(
      'export const useUntrackedPathname = __cjs_exports__["useUntrackedPathname"];',
    );
    expect(result.moduleType).toBe("js");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("does not classify parents from nested use-client requires", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-cjs-nested-parent-"));
  try {
    const packageRoot = path.join(root, "node_modules/example");
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.writeFileSync(path.join(packageRoot, "package.json"), '{"type":"commonjs"}');

    const parentFile = path.join(packageRoot, "parent.js");
    const clientFile = path.join(packageRoot, "client.js");
    const parentCode = `
exports.load = function load() {
  return require("./client");
};
`;
    const clientCode = '"use client";\nexports.Client = function Client() {};';
    fs.writeFileSync(parentFile, parentCode);
    fs.writeFileSync(clientFile, clientCode);

    const transform = getHookHandler(findPlugin("rsc:cjs-browser-transform").transform);
    const context = {
      environment: {
        name: "client",
        config: { cacheDir: path.join(root, "node_modules/.vite") },
      },
    };

    expect(await transform.call(context as never, parentCode, parentFile)).toBeUndefined();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rewrites only transformed child requires to virtual CJS browser ids", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-cjs-child-rewrite-"));
  try {
    const packageRoot = path.join(root, "node_modules/example");
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.writeFileSync(path.join(packageRoot, "package.json"), '{"type":"commonjs"}');

    const parentFile = path.join(packageRoot, "parent.js");
    const clientFile = path.join(packageRoot, "client.js");
    const serverFile = path.join(packageRoot, "server.js");
    const parentCode = `
const client = require("./client");
const server = require("./server");
exports.Client = client.Client;
exports.server = server;
`;
    const clientCode = '"use client";\nexports.Client = function Client() {};';
    const serverCode = 'exports.value = "server";';
    fs.writeFileSync(parentFile, parentCode);
    fs.writeFileSync(clientFile, clientCode);
    fs.writeFileSync(serverFile, serverCode);

    const transform = getHookHandler(findPlugin("rsc:cjs-browser-transform").transform);
    const result = (await transform.call(
      {
        environment: {
          name: "client",
          config: { cacheDir: path.join(root, "node_modules/.vite") },
        },
      } as never,
      parentCode,
      parentFile,
    )) as { code: string };

    expect(result.code).toContain("rsc:cjs-browser-esm:");
    expect(result.code).toContain("client.js");
    expect(result.code).toContain('await import("./server")');
    expect(result.code).not.toContain("server.js.mjs");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("transforms CommonJS .js packages through the optimizer transform hook", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-cjs-js-"));
  try {
    const packageRoot = path.join(root, "node_modules/example");
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.writeFileSync(path.join(packageRoot, "package.json"), '{"type":"commonjs"}');

    const clientFile = path.join(packageRoot, "client.js");
    const parentFile = path.join(packageRoot, "entry-base.js");
    const clientCode = '"use client";\nexports.Client = function Client() {};';
    const parentCode =
      'const client = require("./client");\nexports.Client = client.Client;\nexports.default = client;';
    fs.writeFileSync(clientFile, clientCode);
    fs.writeFileSync(parentFile, parentCode);

    const transform = getHookHandler(findPlugin("rsc:cjs-browser-transform").transform);
    const context = {
      environment: {
        name: "client",
        config: { cacheDir: path.join(root, "node_modules/.vite") },
      },
    };

    const parentResult = (await transform.call(context as never, parentCode, parentFile)) as {
      code: string;
      moduleType?: string;
    };
    const clientResult = (await transform.call(context as never, clientCode, clientFile)) as {
      code: string;
      moduleType?: string;
    };

    expect(parentResult.code).toContain("rsc:cjs-browser-esm:");
    expect(parentResult.code).toContain("client.js");
    expect(parentResult.code).toContain("export const __cjs_module_runner_transform = true");
    expect(parentResult.moduleType).toBe("js");
    expect(clientResult.code).toContain("registerClientReference");
    expect(clientResult.code).toContain("/@id/__x00__rsc:cjs-browser-esm:");
    expect(clientResult.code).not.toContain("__cjs_module_runner_transform");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("loads direct use-client CommonJS as executable ESM in browser execution environments", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-cjs-browser-client-"));
  try {
    const packageRoot = path.join(root, "node_modules/example");
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.writeFileSync(path.join(packageRoot, "package.json"), '{"type":"commonjs"}');

    const clientFile = path.join(packageRoot, "client.cjs");
    fs.writeFileSync(
      clientFile,
      '// package banner\n"use client";\nconst React = require("react");\nexports.Client = function Client() { return React.createElement("button"); };',
    );

    for (const environmentName of ["react_client", "react_ssr"]) {
      const plugin = findPlugin("rsc:cjs-browser-transform");
      const resolveId = getHookHandler(plugin.resolveId);
      const load = getHookHandler(plugin.load);
      const reactFile = path.join(root, "node_modules/react/index.js");
      let bareImportImporter: string | undefined;
      const clientId = (await resolveId.call(
        {
          environment: {
            name: environmentName,
            config: { cacheDir: path.join(root, "node_modules/.vite") },
          },
          resolve: async (source: string, importer: string | undefined) => {
            if (source === "react") {
              bareImportImporter = importer;
              return { id: reactFile, external: false };
            }
            return { id: source, external: false };
          },
        } as never,
        clientFile,
        undefined,
        { isEntry: false },
      )) as string;
      const bareImportId = await resolveId.call(
        {
          environment: {
            name: environmentName,
            config: { cacheDir: path.join(root, "node_modules/.vite") },
          },
          resolve: async (source: string, importer: string | undefined) => {
            bareImportImporter = importer;
            return { id: reactFile, external: false };
          },
        } as never,
        "react",
        clientId,
        { isEntry: false },
      );

      const result = (await load.call(
        {
          environment: {
            name: environmentName,
            config: { cacheDir: path.join(root, "node_modules/.vite") },
          },
        } as never,
        clientId,
      )) as { code: string; moduleType?: string };

      expect(result.code).toContain('(__cjs_interop__(await import("react")))');
      expect(result.code).toContain('export const Client = __cjs_exports__["Client"];');
      expect(result.code).toContain("export const __cjs_module_runner_transform = true");
      expect(result.code).not.toContain("registerClientReference");
      expect(result.moduleType).toBe("js");
      expect(bareImportId).toBe(reactFile);
      expect(bareImportImporter).toBe(clientFile);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("can re-export direct use-client CommonJS from a stable module id", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-cjs-reexport-client-"));
  try {
    const packageRoot = path.join(root, "node_modules/example");
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.writeFileSync(path.join(packageRoot, "package.json"), '{"type":"commonjs"}');

    const clientFile = path.join(packageRoot, "client.cjs");
    const clientCode =
      '"use client";\nObject.defineProperty(exports, "Client", { enumerable: true, get: function() { return Client; } });\nexports.default = function Client() {};\nfunction Client() {}';
    fs.writeFileSync(clientFile, clientCode);

    const plugin = findPlugin("rsc:cjs-browser-transform", {
      boundary: {
        moduleId: (id) => (id === clientFile ? "example/client.cjs" : undefined),
      },
    });
    const resolveId = getHookHandler(plugin.resolveId);
    const load = getHookHandler(plugin.load);
    const context = {
      environment: {
        name: "react_ssr",
        config: { cacheDir: path.join(root, "node_modules/.vite") },
      },
      resolve: async (source: string) => ({ id: source, external: false }),
    };

    const clientId = (await resolveId.call(context as never, clientFile, undefined, {
      isEntry: false,
    })) as string;
    const result = (await load.call(context as never, clientId)) as {
      code: string;
      moduleType?: string;
    };

    expect(result.code).toBe(
      '"use client";\nexport { Client, default } from "example/client.cjs";\n',
    );
    expect(result.moduleType).toBe("js");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("wraps selected Next CJS utilities only when reached from executable virtual boundaries", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-cjs-virtual-child-"));
  try {
    const clientRoot = path.join(root, "node_modules/next/dist/client/components");
    const cacheDir = path.join(root, "node_modules/.vite");
    fs.mkdirSync(clientRoot, { recursive: true });
    fs.writeFileSync(path.join(root, "node_modules/next/package.json"), "{}");

    const clientFile = path.join(clientRoot, "layout-router.cjs");
    const notFoundFile = path.join(clientRoot, "not-found.js");
    const fallbackFile = path.join(clientRoot, "http-access-fallback/http-access-fallback.js");
    fs.mkdirSync(path.dirname(fallbackFile), { recursive: true });
    fs.writeFileSync(
      clientFile,
      '"use client";\nexports.load = function load() { return require("./not-found"); };',
    );
    fs.writeFileSync(
      notFoundFile,
      'const fallback = require("./http-access-fallback/http-access-fallback");\nexports.notFound = function notFound() { return fallback; };',
    );
    fs.writeFileSync(fallbackFile, "exports.HTTPAccessErrorStatus = { NOT_FOUND: 404 };");

    const plugin = findPlugin("rsc:cjs-browser-transform", {
      ...testNextRuntimeOptions(),
      boundary: {
        ...(testNextRuntimeOptions().boundary ?? {}),
        include: (id) => id === clientFile,
        includeReferenced: (id) => id === clientFile,
      },
    });
    const resolveId = getHookHandler(plugin.resolveId);
    const load = getHookHandler(plugin.load);
    const context = {
      environment: {
        name: "react_client",
        config: { cacheDir },
      },
      resolve: async (source: string, importer: string | undefined) => ({
        id:
          source === "./not-found"
            ? notFoundFile
            : source === "./http-access-fallback/http-access-fallback"
              ? fallbackFile
              : source,
        external: false,
        importer,
      }),
    };

    const clientId = (await resolveId.call(context as never, clientFile, undefined, {
      isEntry: false,
    })) as string;
    await load.call(context as never, clientId);
    const childId = (await resolveId.call(context as never, "./not-found", clientId, {
      isEntry: false,
    })) as string;
    const childResult = (await load.call(context as never, `${childId}?v=1`)) as {
      code: string;
      moduleType?: string;
    };

    expect(childId).toContain("rsc:cjs-browser-esm:");
    expect(childResult.code).toContain("var exports = {}; var module = { exports };");
    expect(childResult.code).toContain("rsc:cjs-browser-esm:");
    expect(childResult.code).toContain("http-access-fallback.js");
    expect(childResult.code).toContain('export const notFound = __cjs_exports__["notFound"];');
    expect(childResult.moduleType).toBe("js");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("can explicitly proxy client boundaries when an optimizer hook has no environment name", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-cjs-optimizer-proxy-"));
  try {
    const packageRoot = path.join(root, "node_modules/example");
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.writeFileSync(path.join(packageRoot, "package.json"), '{"type":"commonjs"}');

    const clientFile = path.join(packageRoot, "client.js");
    const clientCode = '"use client";\nexports.Client = function Client() {};';
    fs.writeFileSync(clientFile, clientCode);

    const transform = getHookHandler(
      findPlugin("rsc:cjs-browser-transform", { boundary: { proxy: true } }).transform,
    );
    const result = (await transform.call(
      {
        environment: {
          config: { cacheDir: path.join(root, "node_modules/.vite") },
        },
      } as never,
      clientCode,
      clientFile,
    )) as { code: string; moduleType?: string };

    expect(result.code).toContain("registerClientReference");
    expect(result.code).not.toContain("__cjs_module_runner_transform");
    expect(result.moduleType).toBe("js");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function findPlugin(name: string, options?: Parameters<typeof cjsBrowserPlugin>[0]): Plugin {
  const plugin = cjsBrowserPlugin(options).find((candidate) => candidate.name === name);
  if (!plugin) throw new Error(`Could not find ${name}.`);
  return plugin;
}

function testNextRuntimeOptions(): CjsBrowserPluginOptions {
  return {
    runtime: {
      include: (id) =>
        /[/\\]node_modules[/\\]next[/\\]dist[/\\](?:client[/\\].+|compiled[/\\][^/\\]+[/\\]index|lib[/\\].+|next-devtools[/\\].+|server[/\\]dev[/\\]hot-reloader-types|shared[/\\].+)\.js$/.test(
          id,
        ),
      moduleId: (id) => {
        const marker = `${path.sep}node_modules${path.sep}next${path.sep}dist${path.sep}`;
        const markerIndex = id.lastIndexOf(marker);
        if (markerIndex === -1) return;
        return `next/dist/${id
          .slice(markerIndex + marker.length)
          .split(path.sep)
          .join("/")}`;
      },
      resolveBareImport: (source, environmentName) => {
        if (source !== "react-server-dom-webpack/client") return;
        return environmentName === "react_client"
          ? "@vitejs/plugin-rsc/vendor/react-server-dom/client.browser"
          : "@vitejs/plugin-rsc/vendor/react-server-dom/client.edge";
      },
      rewriteNestedRequires: (id) =>
        !/[/\\]node_modules[/\\]next[/\\]dist[/\\]client[/\\]components[/\\]navigation-untracked\.js$/.test(
          id,
        ),
    },
  };
}

function isTestNextInternalDependency(id: string) {
  return /[/\\]node_modules[/\\]next[/\\]dist[/\\]/.test(id);
}

function getHookHandler<T extends (...args: never[]) => unknown>(
  hook: T | { handler: T } | undefined,
): T {
  if (!hook) throw new Error("Expected Vite hook to be defined.");
  return typeof hook === "function" ? hook : hook.handler;
}
