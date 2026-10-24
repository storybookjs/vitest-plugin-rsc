import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { normalizePath, type Plugin } from "vite";
import { defineProject } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext, type NextBuild } from "vitest-plugin-rsc/nextjs/plugin";
import { vitestPluginRscSourceConditions } from "../../vitest.conditions.ts";
import { cacheDir } from "../test-helpers/vite-cache.ts";

// Stands in for a service the app's server calls: it answers with the number
// of requests it has had for a key.
function hitsService(): Plugin {
  const hits = new Map<string, number>();
  return {
    name: "nextjs-e2e-demo:hits-service",
    configureServer(server) {
      // A server that takes a request and never answers it.
      server.middlewares.use("/service/never", () => {});
      server.middlewares.use("/service/hits", (request, response) => {
        const key = new URL(request.url ?? "/", "http://localhost").searchParams.get("key") ?? "";
        hits.set(key, (hits.get(key) ?? 0) + 1);
        response.setHeader("content-type", "application/json");
        response.setHeader("cache-control", "no-store");
        response.end(JSON.stringify({ hits: hits.get(key) }));
      });
    },
  };
}

// Stands in for a stylesheet that the network brings late: it answers a
// request for a key once the test has released the key.
function lateStylesheetService(): Plugin {
  const waiting = new Map<string, Array<() => void>>();
  const released = new Set<string>();
  const keyOf = (url = "/") => new URL(url, "http://localhost").searchParams.get("key") ?? "";
  return {
    name: "nextjs-e2e-demo:late-stylesheet-service",
    configureServer(server) {
      server.middlewares.use("/service/late-stylesheet/release", (request, response) => {
        const key = keyOf(request.url);
        released.add(key);
        for (const answer of waiting.get(key) ?? []) answer();
        waiting.delete(key);
        response.end();
      });
      server.middlewares.use("/service/late-stylesheet", (request, response) => {
        const key = keyOf(request.url);
        const answer = () => {
          response.setHeader("content-type", "text/css");
          response.setHeader("cache-control", "no-store");
          response.end(".late { color: rgb(0, 0, 255); }");
        };
        if (released.has(key)) answer();
        else waiting.set(key, [...(waiting.get(key) ?? []), answer]);
      });
    },
  };
}

// Stands in for a service that the app's server sends a body to: it answers
// with the body it got.
function bodyService(): Plugin {
  return {
    name: "nextjs-e2e-demo:body-service",
    configureServer(server) {
      server.middlewares.use("/service/body", (request, response) => {
        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () => {
          response.setHeader("content-type", "text/plain");
          response.end(`${request.method} ${Buffer.concat(chunks).toString()}`);
        });
      });
    },
  };
}

// Stands in for a service of another origin, which the tests reach at
// `elsewhere.localhost`: it answers with the headers it got.
function headersService(): Plugin {
  return {
    name: "nextjs-e2e-demo:headers-service",
    configureServer(server) {
      server.middlewares.use("/service/headers", (request, response) => {
        response.setHeader("access-control-allow-origin", "*");
        response.setHeader(
          "access-control-allow-headers",
          request.headers["access-control-request-headers"] ?? "*",
        );
        response.setHeader("content-type", "application/json");
        response.end(request.method === "OPTIONS" ? "" : JSON.stringify(request.headers));
      });
    },
  };
}

// Stands in for a change to a file of the app while the tests are watched:
// the dev server invalidates the modules of the file, as it does for a change.
// With `content`, that is what the file has from then on for the dev server,
// which leaves the file as it is. Without, it has what is in the file again.
function fileChangeService(): Plugin {
  const contents = new Map<string, string>();
  return {
    name: "nextjs-e2e-demo:file-change-service",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use("/service/file-change", (request, response) => {
        const { searchParams } = new URL(request.url ?? "/", "http://localhost");
        const changed = normalizePath(
          path.join(server.config.root, searchParams.get("file") ?? ""),
        );
        const content = searchParams.get("content");
        if (content === null) contents.delete(changed);
        else contents.set(changed, content);
        for (const environment of Object.values(server.environments)) {
          environment.moduleGraph.onFileChange(changed);
        }
        response.end();
      });
    },
    load: (id) => contents.get(id.split("?")[0]!),
  };
}

// Counts what the dev server compiles as a module, by the path of its file
// under the root of the app.
function transformsService(): Plugin {
  const transforms = new Map<string, number>();
  let root = "";
  return {
    name: "nextjs-e2e-demo:transforms-service",
    // First, so that a transform counts also when a later plugin fails on
    // the file.
    enforce: "pre",
    configResolved(config) {
      root = config.root;
    },
    transform(_code, id) {
      const file = normalizePath(path.relative(root, id.split("?")[0]!));
      transforms.set(file, (transforms.get(file) ?? 0) + 1);
    },
    configureServer(server) {
      server.middlewares.use("/service/transforms", (request, response) => {
        const file = new URL(request.url ?? "/", "http://localhost").searchParams.get("file") ?? "";
        response.setHeader("content-type", "application/json");
        response.setHeader("cache-control", "no-store");
        response.end(JSON.stringify({ transforms: transforms.get(file) ?? 0 }));
      });
    },
  };
}

// Google Fonts, without the network: see the file.
process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES = fileURLToPath(
  new URL("../../vitest.google-fonts.cjs", import.meta.url),
);

// Next's development code, or its production code with
// `VITEST_PLUGIN_RSC_BUILD=production`, which CI runs the suite with too.
// oxlint-disable-next-line no-process-env
const build = (process.env.VITEST_PLUGIN_RSC_BUILD || "development") as NextBuild;

// The version of the React that Next comes with, which its layers run on, and
// not the `react` of the app.
const nextReact = (
  createRequire(import.meta.url)("next/dist/compiled/react") as { version: string }
).version;

export default defineProject({
  root: fileURLToPath(new URL("./", import.meta.url)),
  // On Bun, a dependency cache of its own: see ../test-helpers/vite-cache.ts.
  cacheDir,
  plugins: [
    transformsService(),
    vitestPluginRSC(),
    // The helpers in `test/` work on the page, so they have to see the browser.
    // Every other module that is not a test file is server code.
    vitestPluginNext({ browserModules: ["test/**"], build }),
    hitsService(),
    bodyService(),
    headersService(),
    lateStylesheetService(),
    fileChangeService(),
  ],
  resolve: {
    conditions: vitestPluginRscSourceConditions,
    // A module of Node.js that the app's server calls and a browser has no
    // stand-in for: the app's own, see stand-ins/.
    alias: [
      {
        find: /^(node:)?child_process$/,
        replacement: fileURLToPath(new URL("./stand-ins/child_process.ts", import.meta.url)),
      },
    ],
  },
  test: {
    name: "nextjs-e2e-demo",
    include: ["**/*.test.{ts,tsx}"],
    // The build and its test run without Vitest: see vite.config.ts.
    exclude: ["node_modules", "build-test/**", "dist/**"],
    provide: { build, nextReact },
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
    isolate: false,
    // The first is server code, like a test file: the second has `"use client"`.
    setupFiles: ["./vitest.setup.ts", "./vitest.setup.client.tsx"],
  },
});
