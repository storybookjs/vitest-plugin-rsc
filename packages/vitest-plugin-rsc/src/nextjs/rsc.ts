import { createServerManifest } from "@vitejs/plugin-rsc/core/rsc";
import * as ReactServer from "@vitejs/plugin-rsc/react/rsc";
import { prerender } from "@vitejs/plugin-rsc/react/rsc/static";
import * as FlightServer from "@vitejs/plugin-rsc/vendor/react-server-dom/server.edge";
import builtLayers from "virtual:vitest-plugin-rsc/layers";
import appPages from "virtual:vitest-plugin-rsc/next-app-pages";
import loadMiddleware from "virtual:vitest-plugin-rsc/next-middleware";
import routeHandlers from "virtual:vitest-plugin-rsc/next-route-handlers";
import serverReferences from "virtual:vitest-plugin-rsc/next-server-references";
import type { FlightAdapters } from "./flight.ts";
import { clientNodeReference } from "./client-ids.ts";
import { actionModulePrefix, registry } from "./registry.ts";
import {
  builtStylesheetsFile,
  builtStylesheetsOf,
  stylesheetsPath,
  type BuiltStylesheets,
  type Stylesheets,
} from "./styles-command.ts";

// The rsc layer: Server Components, Server Actions, route handlers and the
// Flight encoder.

declare let __vite_rsc_raw_import__: (id: string) => Promise<unknown>;

// The module of a server reference, by the id Vite RSC gives it. With a dev
// server that is what Vite imports the module by. A static build has a list
// of them: see build.ts.
ReactServer.setRequireModule({
  load: (id) => {
    if (!serverReferences) return __vite_rsc_raw_import__(id);
    const load = serverReferences[id];
    if (!load) throw new Error(`vitest-plugin-rsc: the build has no Server Action module "${id}"`);
    return load();
  },
});

// Next passes its client and server reference manifests to the Flight codec.
// Vite RSC resolves a reference by its module id at runtime, with manifests of
// its own, so these take Next's manifest arguments and leave them out. See
// flight.ts for the exports of Next's codec that are not here.
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

registry.loadAppPage = async (page) => {
  const load = (appPages as Record<string, () => Promise<unknown>>)[page];
  if (!load) throw new Error(`vitest-plugin-rsc: unknown Next.js app page ${page}`);
  registry.reportLoaded?.("page", page);
  return (registry.appPages[page] ??= await load());
};

/**
 * client-node.tsx, as the server has it: a reference. The page of a node of
 * the browser layer is this one Client Component.
 */
export const ClientNode: unknown = ReactServer.registerClientReference(
  () => {
    throw new Error("vitest-plugin-rsc: a node of the browser layer does not render on the server");
  },
  clientNodeReference,
  "ClientNode",
);

// The stylesheets of a route are the plugin's to say, as they are a build's:
// see styles.ts. Under Vitest a command says them, which knows the test file
// that asks (setup.ts). Another host asks the dev server, and a static build
// has them in a file of its own, in the directory of the build.
const buildDirectory = builtLayers && Object.values(builtLayers)[0]?.base;
let built: Promise<BuiltStylesheets> | undefined;
const json = async <T>(url: string): Promise<T> => {
  const response = await registry.network(url);
  if (!response.ok) {
    throw new Error(
      `vitest-plugin-rsc: ${url} answered ${response.status}: ${await response.text()}`,
    );
  }
  return (await response.json()) as T;
};
registry.loadStylesheets = async (entry, inline) => {
  if (!buildDirectory) {
    const query = new URLSearchParams({ entry, inline: String(inline) });
    return json<Stylesheets>(`${stylesheetsPath}?${query}`);
  }
  built ??= json<BuiltStylesheets>(new URL(builtStylesheetsFile, buildDirectory).href);
  // One that failed is asked again.
  built.catch(() => (built = undefined));
  return builtStylesheetsOf(await built, entry, buildDirectory);
};

/** The page module of the route of a node: see `loadNodeEntry()` in project/entries.ts. */
export async function loadComponent(): Promise<{ default: () => unknown }> {
  return {
    default: function Component() {
      const node = registry.opened?.node;
      if (!node) throw new Error("vitest-plugin-rsc: the node of the test is gone");
      return node.ui;
    },
  };
}

registry.loadRouteHandler = async (page) => {
  const load = routeHandlers[page];
  if (!load) throw new Error(`vitest-plugin-rsc: unknown Next.js route handler ${page}`);
  registry.reportLoaded?.("route", page);
  return (await load()).handler;
};

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
  if (id.startsWith(actionModulePrefix)) {
    const [module] = id.slice(actionModulePrefix.length).split("#");
    registry.reportLoaded?.("action", module!);
  }
  let loading = modules.get(id);
  if (!loading) modules.set(id, (loading = loadModule(id)));
  return loading;
}

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
