import { createServerManifest } from "@vitejs/plugin-rsc/core/rsc";
import * as ReactServer from "@vitejs/plugin-rsc/react/rsc";
import { prerender } from "@vitejs/plugin-rsc/react/rsc/static";
import * as FlightServer from "@vitejs/plugin-rsc/vendor/react-server-dom/server.edge";
import appPages from "virtual:vitest-plugin-rsc/next-app-pages";
import loadMiddleware from "virtual:vitest-plugin-rsc/next-middleware";
import routeHandlers from "virtual:vitest-plugin-rsc/next-route-handlers";
import { nextConfig, speedFeatures } from "virtual:vitest-plugin-rsc/next-manifest";
import serverReferences from "virtual:vitest-plugin-rsc/server-references";
import { createElement, type ReactNode } from "react";
import type { FlightAdapters } from "./flight.ts";
import { buildDirectory, builtFiles } from "./built-files.ts";
import { NoFallbackError } from "./compat/rsc/handlers.ts";
import { preloadPage } from "./document.ts";
import { oncePerTestFile } from "./speed-features.ts";
import { actionModulePrefix, registry } from "./registry.ts";
import { askDevServer } from "../utils.ts";
// By the package, so that it stays a module of its own with its "use client"
// in the build of the package, and in the one of the app it is a client
// reference: see node-rendered.tsx.
import { NodeRendered } from "vitest-plugin-rsc/nextjs/node-rendered";
import {
  builtStylesheetsOf,
  stylesheetsEvent,
  type Stylesheets,
  type StylesheetsQuestion,
} from "./styles-shared.ts";

// The rsc layer: Server Components, Server Actions, route handlers and the
// Flight encoder.

declare let __vite_rsc_raw_import__: (id: string) => Promise<unknown>;

// The module of a server reference, by the id Vite RSC gives it. With a dev
// server that is what Vite imports the module by. A static build has a list
// of them: see ../static-build.ts.
ReactServer.setRequireModule({
  load: (id) => {
    if (!serverReferences) return __vite_rsc_raw_import__(id);
    const load = serverReferences[id];
    if (!load) {
      return Promise.reject(
        new Error(`vitest-plugin-rsc: the build has no Server Action module "${id}"`),
      );
    }
    return load();
  },
});

// Next passes its client and server reference manifests to the Flight codec.
// Vite RSC resolves a reference by its module id at runtime, with manifests of
// its own, so these take Next's manifest arguments and leave them out. See
// flight.ts for the exports of Next's codec that are not here.
// What the page reads of the speed features before it renders: see
// speed-features.ts.
registry.speedFeatures = speedFeatures;

registry.flightServer = {
  renderToReadableStream: (model: unknown, _clientModules: unknown, options?: object) =>
    ReactServer.renderToReadableStream(model, options),
  decodeReply: (body: string | FormData, _serverModules: unknown, options?: object) =>
    ReactServer.decodeReply(body, options),
  decodeReplyFromAsyncIterable: (
    body: AsyncIterable<[string, string | File]>,
    _serverModules: unknown,
    options?: object,
  ) => FlightServer.decodeReplyFromAsyncIterable(body, createServerManifest(), options),
  decodeAction: (body: FormData) => ReactServer.decodeAction(body),
  decodeFormState: (result: unknown, body: FormData) => ReactServer.decodeFormState(result, body),
  createTemporaryReferenceSet: ReactServer.createTemporaryReferenceSet,
  registerServerReference: ReactServer.registerServerReference,
  registerClientReference: ReactServer.registerClientReference,
  createClientModuleProxy: FlightServer.createClientModuleProxy,
} satisfies FlightAdapters<"server">;

// Next's Node.js server reads the body of a Server Action with busboy, and
// React decodes it as the parts come in. Here the parts are collected first.
type Busboy = { on(event: string, listener: (...args: any[]) => void): void };
registry.flightServer.decodeReplyFromBusboy = (
  busboy: Busboy,
  _serverModules: unknown,
  options?: object,
) =>
  new Promise((resolve, reject) => {
    const form = new FormData();
    busboy.on("field", (name: string, value: string) => form.append(name, value));
    busboy.on(
      "file",
      (name: string, file: Busboy, info: { filename: string; mimeType: string }) => {
        const chunks: BlobPart[] = [];
        file.on("data", (chunk: Uint8Array) => chunks.push(new Uint8Array(chunk)));
        file.on("end", () =>
          form.append(name, new File(chunks, info.filename, { type: info.mimeType })),
        );
      },
    );
    busboy.on("error", reject);
    busboy.on("finish", () => resolve(ReactServer.decodeReply(form, options)));
  });

registry.flightStatic = {
  prerender: (model: unknown, _clientModules: unknown, options?: object) =>
    prerender(model, options),
} satisfies FlightAdapters<"static">;

registry.flightClient = {
  createFromReadableStream: (
    stream: ReadableStream<Uint8Array>,
    { serverConsumerManifest: _, ...options }: { serverConsumerManifest?: unknown } = {},
  ) => ReactServer.createFromReadableStream(stream, options),
  encodeReply: ReactServer.encodeReply,
  createTemporaryReferenceSet: ReactServer.createClientTemporaryReferenceSet,
} satisfies FlightAdapters<"client">;

// Next's route module makes a cache of its own for its response cache, with
// the cache handlers of `next.config`, which it imports by their file. The
// server here has one cache, which it hands Next for every request, and which
// has loaded those handlers: see cache.ts.
type RouteEntry = { routeModule?: { getIncrementalCache?: () => Promise<unknown> } };
function withServerCache<T>(entry: T): T {
  const { routeModule } = entry as RouteEntry;
  if (routeModule) routeModule.getIncrementalCache = async () => globalThis.__incrementalCache;
  return entry;
}

registry.loadAppPage = async (page) => {
  const load = (appPages as Record<string, () => Promise<unknown>>)[page];
  if (!load) throw new Error(`vitest-plugin-rsc: unknown Next.js app page ${page}`);
  return (registry.appPages[page] ??= withServerCache(await load()));
};

// The stylesheets of a route are the plugin's to say, as they are a build's:
// see styles.ts. The route of a node also has those of the files of the host
// that render the node, which ssr.ts passes. A static build has them in a
// file of its own, in the directory of the build, with the modules of every
// route: see built-files.ts. The page asks for it as it starts, not at its
// first page load. With a dev server, the dev server answers.
// A const of this module, which TypeScript narrows in the functions below too.
const directory = buildDirectory;
if (directory) {
  // A file that failed to load is asked for again, by the page load that needs it.
  builtFiles().catch(() => {});
  // A file the build has no stylesheets for, once for the page, as the dev
  // server warns once.
  const warned = new Set<string>();
  const missing = (file: string) => {
    if (warned.has(file)) return;
    warned.add(file);
    console.warn(
      `vitest-plugin-rsc: the files that render a node, \`hostFiles\` of renderServer(), ` +
        `name ${file}, which the static build has no stylesheets for: it is no file of the ` +
        `host that the rsc layer built. In a build the files of the host are what ` +
        `\`host.files\` of vitestPluginNext() matches, named from the root of the project. ` +
        `The stylesheets it imports are not linked.`,
    );
  };
  registry.loadStylesheets = async (entry, _inline, files) =>
    builtStylesheetsOf(await builtFiles(), entry, directory, files, missing);
  // A page load starts the files of its route at once, where Next would load
  // its modules one segment after the other, and link its stylesheets only
  // once the HTML is there. Next links a stylesheet at its path under the
  // asset prefix, encoded segment by segment, in the CORS mode of
  // `crossOrigin` of next.config: the preload is of that URL, in that mode,
  // or the browser fetches the file a second time. Its production code links
  // it at that path alone. Its development code adds the time of the
  // request, and a deployment id adds the id, which a preload cannot know:
  // then only the modules start.
  const linksAtPath = process.env.NODE_ENV === "production" && !nextConfig.deploymentId;
  const encoded = (path: string) => path.split("/").map(encodeURIComponent).join("/");
  registry.preloadRoute = async (entry, files, signal) => {
    // A file that failed to load fails the page load in `loadStylesheets()`.
    const built = await builtFiles().catch(() => undefined);
    if (!built || signal?.aborted) return;
    const linked = Object.values(builtStylesheetsOf(built, entry, directory, files)).flat();
    preloadPage({
      stylesheets: linksAtPath
        ? linked.map(
            ({ path }) =>
              new URL(`${nextConfig.assetPrefix}/_next/${encoded(path)}`, location.href).href,
          )
        : [],
      crossOrigin: nextConfig.crossOrigin || undefined,
      modules: (built.modules[entry] ?? []).map(
        (index) => new URL(built.chunks[index]!, directory).href,
      ),
    });
  };
} else {
  // Every request of a page asks: with the speed feature `cacheDevServer` once
  // per test file.
  const stylesheets = new Map<string, Promise<Stylesheets>>();
  registry.loadStylesheets = (entry, inline, files) =>
    oncePerTestFile(stylesheets, JSON.stringify([entry, inline, files]), () =>
      askDevServer<Stylesheets>(stylesheetsEvent, {
        entry,
        inline,
        files,
      } satisfies StylesheetsQuestion),
    );
  // The dev server has a module where the page asks for it, and Next's
  // development code links a stylesheet with the time of the request in its
  // URL, which a preload cannot know.
  registry.preloadRoute = async () => {};
}

/** The page module of the route of a node: see `loadNodeEntry()` in project/entries.ts. */
export async function loadComponent(): Promise<{ default: () => unknown }> {
  return {
    default: function Component() {
      // A request that brings a route of its own, else what the test opened.
      const node = (registry.openedByRequest.getStore() ?? registry.opened)?.node;
      if (!node) throw new Error("vitest-plugin-rsc: the node of the test is gone");
      // A client reference here: the page renders it, around the node.
      const { ui, version } = node;
      return version === undefined ? ui : createElement(NodeRendered, { version }, ui as ReactNode);
    },
  };
}

const loadRouteHandler = async (page: string) => {
  const load = routeHandlers[page];
  if (!load) throw new Error(`vitest-plugin-rsc: unknown Next.js route handler ${page}`);
  return withServerCache(await load());
};
registry.loadRouteHandler = async (page) => (await loadRouteHandler(page)).handler;

// Only `build: "production"` asks for it, see ssr.ts: a run without it loads
// none of the modules of Next's build that the verdict takes, and they are
// not pre-bundled for it (`prerenderId` of plugin.ts).
registry.prerenderVerdict = async ({ kind, page, pathname }) => {
  const { prerenderVerdictOf } = await import("virtual:vitest-plugin-rsc/next-prerender");
  const entry = kind === "route" ? await loadRouteHandler(page) : await registry.loadAppPage(page);
  return prerenderVerdictOf(entry as never, pathname, kind);
};
// The class of the request handlers of the routes, which are of this layer.
registry.isNoFallbackError = (error) => error instanceof NoFallbackError;

registry.loadMiddleware = async () => {
  if (!loadMiddleware) throw new Error("vitest-plugin-rsc: the app has no middleware");
  return (await loadMiddleware()).handler;
};

declare global {
  var __vite_rsc_require__: (id: string) => Promise<unknown>;
}

const modules = new Map<string, Promise<unknown>>();

/**
 * Next's `__next_app__.require`: the module loader of the server bundle, which
 * holds the modules of both server layers. React's Flight codec calls it for a
 * reference in a payload, and Next calls it for the module of a Server Action.
 *
 * Like webpack's, it returns the same promise for the same id: React keeps the
 * state of a module on that promise.
 */
export function requireModule(id: string): Promise<unknown> {
  let loading = modules.get(id);
  if (!loading) modules.set(id, (loading = loadModule(id)));
  return loading;
}

// The plugin's own Server Action is one of the app's: see `serverActionsOf()`
// in ssr.ts. Imported as `runInServerAction()` imports it: by its own module,
// the one with `"use server"`, which Vite RSC compiles. The built package has
// the function in a chunk as well, which a static import here would take, and
// that one has no id.
registry.ownServerAction = import("./server-action.ts").then(
  ({ runInServerActionOfTest }) =>
    Reflect.get(runInServerActionOfTest, "$$id") as string | undefined,
);

// An action id is `<module>#<export>`, and it comes from a request: it may not
// be an id at all, or name an export that is not there or is not an action.
registry.hasServerAction = async (id) => {
  if (!id.includes("#")) return false;
  try {
    const actions = (await requireModule(actionModulePrefix + id)) as Record<string, unknown>;
    const action = actions[id] as { $$typeof?: symbol } | undefined;
    return action?.$$typeof === Symbol.for("react.server.reference");
  } catch {
    // The module did not load. That is an error of the app and not an unknown
    // action: Next loads the module again, gets the same error and reports it.
    return true;
  }
};

async function loadModule(id: string): Promise<unknown> {
  if (id.startsWith(actionModulePrefix)) {
    const actionId = id.slice(actionModulePrefix.length);
    return { [actionId]: await ReactServer.loadServerAction(actionId) };
  }
  // A server reference, the way Vite RSC's manifest spells it.
  if (id.startsWith("$$server:")) return globalThis.__vite_rsc_require__(id);
  // A Client Component, for the HTML render.
  return registry.loadSsrModule(id);
}
