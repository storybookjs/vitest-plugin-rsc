import * as React from "react";
import * as ReactDOMServer from "react-dom/server.browser";
import * as ReactClient from "@vitejs/plugin-rsc/react/ssr";
import type { RscPayload } from "./testing-library-client.tsx";

type TestingLibrarySsrGlobals = typeof globalThis & {
  __VITE_ENVIRONMENT_RUNNER_IMPORT__?: (environmentName: string, id: string) => Promise<unknown>;
  __vite_rsc_client_require__?: (id: string) => Promise<unknown>;
  __vite_rsc_require__?: (id: string) => Promise<unknown>;
  __vitest_plugin_rsc_client_reference_root__?: string;
  __vitest_plugin_rsc_client_reference_root_prefixes__?: string[];
};

const ssrGlobal = globalThis as TestingLibrarySsrGlobals;
let ssrRequire: ((id: string) => Promise<unknown>) | undefined;

export async function renderToHtml(stream: ReadableStream<Uint8Array>) {
  initialize();
  const previousRequire = ssrGlobal.__vite_rsc_client_require__;
  const previousRscRequire = ssrGlobal.__vite_rsc_require__;
  ssrGlobal.__vite_rsc_client_require__ = ssrRequire;
  ssrGlobal.__vite_rsc_require__ = ssrRequire;
  try {
    const payload = ReactClient.createFromReadableStream<RscPayload>(stream);

    function Root() {
      return React.use(payload).root;
    }

    const htmlStream = await ReactDOMServer.renderToReadableStream(<Root />);
    return await new Response(htmlStream).text();
  } finally {
    ssrGlobal.__vite_rsc_client_require__ = previousRequire;
    ssrGlobal.__vite_rsc_require__ = previousRscRequire;
  }
}

export function initialize() {
  if (ssrRequire) return;

  ReactClient.setRequireModule({
    load: importReactSsrReference,
  });
  ssrRequire = importReactSsrReference;
}

function importReactSsrReference(id: string) {
  id = resolveProjectRootRelativeClientReference(id);

  const runnerImport = ssrGlobal.__VITE_ENVIRONMENT_RUNNER_IMPORT__;
  if (runnerImport) {
    return runnerImport("react_ssr", id);
  }

  return import(/* @vite-ignore */ toBrowserImportId(id));
}

function resolveProjectRootRelativeClientReference(id: string) {
  if (id.includes("://")) return id;

  const root =
    ssrGlobal.__vitest_plugin_rsc_client_reference_root__ || process.env.__NEXT_PROJECT_ROOT;
  const prefixes = ssrGlobal.__vitest_plugin_rsc_client_reference_root_prefixes__ ?? [];
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
