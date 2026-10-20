import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { withStaticBuild } from "../static-build.ts";
import { nextStaticBuild, withPathsFromRoot } from "./static-build.ts";

// Next's part of the static build. The build itself is the one of
// `vitestPluginRSC()`: see ../static-build.test.ts.

type Hook = (this: unknown, ...args: any[]) => any;

const plugin = (emittedFiles = () => [] as { pathname: string; body: Uint8Array }[]) =>
  nextStaticBuild({
    environments: { ssr: "next_ssr", browser: "react_client" },
    entries: { ssr: "vitest-plugin-rsc/nextjs/ssr", browser: "vitest-plugin-rsc/nextjs/client" },
    emittedFiles,
  });

test("gives the static build Next's layers, its directives, its order and its files", () => {
  const emittedFiles = () => [{ pathname: "/_next/static/media/a.woff2", body: new Uint8Array() }];

  expect((plugin(emittedFiles).config as Hook)({}, { command: "build" })).toEqual(
    withStaticBuild({
      entries: {
        next_ssr: "vitest-plugin-rsc/nextjs/ssr",
        react_client: "vitest-plugin-rsc/nextjs/client",
      },
      directives: ["use turbopack: no side effects"],
      strictExecutionOrder: true,
      files: emittedFiles,
    }),
  );
  // A dev server is not a build.
  expect((plugin().config as Hook)({}, { command: "serve" })).toBeUndefined();
});

test("says that a build needs vitestPluginRSC(), which builds the layers", () => {
  const configResolved = (plugins: { name: string }[]) =>
    (plugin().configResolved as Hook)({ command: "build", plugins });

  expect(() => configResolved([])).toThrow(
    "vitest-plugin-rsc: vitestPluginNext() needs vitestPluginRSC().",
  );
  expect(() => configResolved([{ name: "vitest-plugin-rsc:static-build" }])).not.toThrow();
});

// Next's config loader makes these absolute paths: the directory of the
// project and of its repository, on the machine that builds.
test("has the paths of next.config from the root of the project", () => {
  const repository = path.join(os.tmpdir(), "repository");
  const root = path.join(repository, "apps", "web");
  const config = {
    basePath: "/docs",
    distDir: ".next",
    configFile: path.join(root, "next.config.ts"),
    outputFileTracingRoot: repository,
    repoRoot: repository,
    turbopack: { root: repository },
    images: { loaderFile: path.join(root, "lib", "image-loader.ts"), path: "/_next/image" },
    cacheHandlers: { remote: path.join(repository, "cache", "handler.js") },
    // The app's own values stay, also one that names a file of the project.
    env: { DATA: path.join(root, "data") },
  };

  expect(withPathsFromRoot(config, root)).toEqual({
    ...config,
    configFile: "next.config.ts",
    outputFileTracingRoot: "../..",
    repoRoot: "../..",
    turbopack: { root: "../.." },
    images: { loaderFile: "lib/image-loader.ts", path: "/_next/image" },
    cacheHandlers: { remote: "../../cache/handler.js" },
  });
});

// A project in `/app`, as in many a container, whose app is served from
// `/app` too.
test("leaves the URLs of next.config as they are, also one that is the path of the project", () => {
  const root = path.resolve("/app");
  const config = {
    basePath: "/app",
    assetPrefix: "/app",
    images: { path: "/app/_next/image" },
    configFile: path.join(root, "next.config.ts"),
    outputFileTracingRoot: root,
  };

  expect(withPathsFromRoot(config, root)).toEqual({
    ...config,
    configFile: "next.config.ts",
    outputFileTracingRoot: ".",
  });
});
