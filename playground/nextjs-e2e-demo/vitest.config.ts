import path from "node:path";
import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { normalizePath, type Plugin } from "vite";
import { defineProject } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext, type NextBuild } from "vitest-plugin-rsc/nextjs/plugin";
import { vitestPluginRscSourceConditions } from "../../vitest.conditions.ts";

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
function fileChangeService(): Plugin {
  return {
    name: "nextjs-e2e-demo:file-change-service",
    configureServer(server) {
      server.middlewares.use("/service/file-change", (request, response) => {
        const file = new URL(request.url ?? "/", "http://localhost").searchParams.get("file") ?? "";
        for (const environment of Object.values(server.environments)) {
          environment.moduleGraph.onFileChange(normalizePath(path.join(server.config.root, file)));
        }
        response.end();
      });
    },
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

export default defineProject({
  root: fileURLToPath(new URL("./", import.meta.url)),
  plugins: [
    transformsService(),
    vitestPluginRSC(),
    // The helpers in `test/` work on the page, so they have to see the browser.
    // Every other module that is not a test file is server code.
    vitestPluginNext({ browserModules: ["test/**"], affectedTests: true, build }),
    hitsService(),
    headersService(),
    fileChangeService(),
  ],
  resolve: {
    conditions: vitestPluginRscSourceConditions,
  },
  test: {
    name: "nextjs-e2e-demo",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules"],
    provide: { build },
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
    isolate: false,
    setupFiles: ["./vitest.setup.ts"],
  },
});
