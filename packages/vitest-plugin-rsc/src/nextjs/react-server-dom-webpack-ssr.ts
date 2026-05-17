import { createServerConsumerManifest, setRequireModule } from "@vitejs/plugin-rsc/core/ssr";
import * as ReactClient from "next/dist/compiled/react-server-dom-webpack/client.edge";

type ReactServerDomClient = {
  createFromReadableStream<T>(
    stream: ReadableStream<Uint8Array>,
    options?: Record<string, unknown>,
  ): Promise<T>;
  createServerReference(id: string): unknown;
};

type ReactSsrGlobals = typeof globalThis & {
  __VITE_ENVIRONMENT_RUNNER_IMPORT__?: (environmentName: string, id: string) => Promise<unknown>;
  __vite_rsc_client_require__?: (id: string) => Promise<unknown>;
  __vite_rsc_require__?: (id: string) => Promise<unknown>;
  __vitest_plugin_rsc_client_reference_root__?: string;
  __vitest_plugin_rsc_client_reference_root_prefixes__?: string[];
};

const client = ReactClient as ReactServerDomClient;
const reactSsrGlobal = globalThis as ReactSsrGlobals;
const nextClientReferenceRootPrefixes = ["/app/", "/src/app/"];

setRequireModule({
  load(id) {
    return importReactSsrClientReference(id);
  },
});
reactSsrGlobal.__vite_rsc_client_require__ = importReactSsrClientReference;
reactSsrGlobal.__vite_rsc_require__ = importReactSsrClientReference;

export function createFromReadableStream<T>(
  stream: ReadableStream<Uint8Array>,
  options: Record<string, unknown> = {},
) {
  return client.createFromReadableStream<T>(stream, {
    serverConsumerManifest: createServerConsumerManifest(),
    ...options,
  });
}

export function createServerReference(id: string) {
  return client.createServerReference(id);
}

export const callServer = null;
export const findSourceMapURL = null;

function importReactSsrClientReference(id: string) {
  id = resolveProjectRootRelativeClientReference(id);

  const runnerImport = reactSsrGlobal.__VITE_ENVIRONMENT_RUNNER_IMPORT__;
  if (runnerImport) {
    return runnerImport("react_ssr", id);
  }

  return import(/* @vite-ignore */ toBrowserImportId(id));
}

function resolveProjectRootRelativeClientReference(id: string) {
  if (id.includes("://")) return id;

  const root =
    reactSsrGlobal.__vitest_plugin_rsc_client_reference_root__ || process.env.__NEXT_PROJECT_ROOT;
  const prefixes =
    reactSsrGlobal.__vitest_plugin_rsc_client_reference_root_prefixes__ ??
    nextClientReferenceRootPrefixes;
  if (id.startsWith("/@id/")) return id;
  if (!root) return id;

  if (id.startsWith("/@fs/")) {
    const fsPath = id.slice("/@fs".length);
    return prefixes.some((prefix) => fsPath.startsWith(prefix)) ? `/@fs${root}${fsPath}` : id;
  }

  if (!prefixes.some((prefix) => id.startsWith(prefix))) return id;

  return `${root}${id}`;
}

function toBrowserImportId(id: string) {
  if (id.startsWith("/")) {
    return id.startsWith("/@fs/") || id.startsWith("/@id/") ? id : `/@fs${id}`;
  }
  if (!id.startsWith("\0") && !id.startsWith(".") && !id.includes("://")) {
    return `/@id/${id}`;
  }
  return id.startsWith("\0") ? `/@id/__x00__${id.slice(1)}` : id;
}
