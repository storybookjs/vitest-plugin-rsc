import { createClientManifest, createServerManifest } from "@vitejs/plugin-rsc/core/rsc";
import * as ReactServer from "@vitejs/plugin-rsc/react/rsc";
import * as FlightServer from "@vitejs/plugin-rsc/vendor/react-server-dom/server.edge";
import * as FlightStatic from "@vitejs/plugin-rsc/vendor/react-server-dom/static.edge";
import appPages from "virtual:vitest-plugin-rsc/next-app-pages";
import routeHandlers from "virtual:vitest-plugin-rsc/next-route-handlers";
import { SequentialAsyncLocalStorage } from "../async-local-storage.ts";
import { actionModulePrefix, registry } from "./registry.ts";

// The rsc layer: Server Components, Server Actions, route handlers and the
// Flight encoder.

declare let __vite_rsc_raw_import__: (id: string) => Promise<unknown>;

ReactServer.setRequireModule({
  load: (id) => __vite_rsc_raw_import__(id),
});

// Next passes its client and server reference manifests to the Flight codec.
// Vite RSC resolves a reference by its module id at runtime, with manifests of
// its own, so these take Next's manifest arguments and leave them out.
// SPIKE (research/use-cache-spike): how a cached function starts in its scope.
//
// Next enters the store of a cache scope, decodes the arguments, which it
// awaits, and only then renders the result: `renderToReadableStream(promise)`
// with a promise that calls the function when React first reads it. Node has
// carried the store there. Here the two calls are tied by what Next passes to
// both, the set of temporary references: the scope the arguments were decoded
// in is the scope their function is called in.
type Scope = ReturnType<typeof SequentialAsyncLocalStorage.snapshot>;
type FlightOptions = { temporaryReferences?: object };
const scopes = new WeakMap<object, Scope>();
const spikeVariant: string =
  (import.meta as { env?: Record<string, string> }).env?.VITE_SPIKE_CTX ?? "stack";

function inScopeOfReply(model: unknown, options?: FlightOptions): unknown {
  const scope = options?.temporaryReferences && scopes.get(options.temporaryReferences);
  const thenable = model as PromiseLike<unknown> | null;
  if (!scope || /^none|nolink$/.test(spikeVariant) || typeof thenable?.then !== "function") {
    return model;
  }
  return {
    then: (onFulfilled: (value: unknown) => unknown, onRejected: (error: unknown) => unknown) =>
      scope(() => thenable.then(onFulfilled, onRejected)),
  };
}

registry.flightServer = {
  renderToReadableStream: (model: unknown, _clientModules: unknown, options?: FlightOptions) =>
    ReactServer.renderToReadableStream(inScopeOfReply(model, options), options),
  decodeReply: (body: string | FormData, _serverModules: unknown, options?: FlightOptions) => {
    if (options?.temporaryReferences) {
      scopes.set(options.temporaryReferences, SequentialAsyncLocalStorage.snapshot());
    }
    return ReactServer.decodeReply(body, options);
  },
  decodeReplyFromAsyncIterable: (
    body: AsyncIterable<[string, string | File]>,
    _serverModules: unknown,
    options?: FlightOptions,
  ) => {
    if (options?.temporaryReferences) {
      scopes.set(options.temporaryReferences, SequentialAsyncLocalStorage.snapshot());
    }
    return FlightServer.decodeReplyFromAsyncIterable(body, createServerManifest(), options);
  },
  decodeAction: (body: FormData) => ReactServer.decodeAction(body),
  decodeFormState: (result: unknown, body: FormData) => ReactServer.decodeFormState(result, body),
  createTemporaryReferenceSet: ReactServer.createTemporaryReferenceSet,
  registerServerReference: ReactServer.registerServerReference,
  registerClientReference: ReactServer.registerClientReference,
  createClientModuleProxy: FlightServer.createClientModuleProxy,
};
registry.flightStatic = {
  prerender: (model: unknown, _clientModules: unknown, options?: FlightOptions) =>
    FlightStatic.prerender(inScopeOfReply(model, options), createClientManifest(), options),
};
registry.flightClient = {
  createFromReadableStream: (
    stream: ReadableStream<Uint8Array>,
    { serverConsumerManifest: _, ...options }: { serverConsumerManifest?: unknown } = {},
  ) => ReactServer.createFromReadableStream(stream, options),
  encodeReply: ReactServer.encodeReply,
  createTemporaryReferenceSet: ReactServer.createClientTemporaryReferenceSet,
};

registry.loadAppPage = async (page) => {
  const load = (appPages as Record<string, () => Promise<unknown>>)[page];
  if (!load) throw new Error(`vitest-plugin-rsc: unknown Next.js app page ${page}`);
  return (registry.appPages[page] ??= await load());
};

registry.loadRouteHandler = async (page) => {
  const load = routeHandlers[page];
  if (!load) throw new Error(`vitest-plugin-rsc: unknown Next.js route handler ${page}`);
  return (await load()).handler;
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
