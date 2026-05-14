import type { Plugin } from "vite";
import { getProjectRoot, tryResolveFromProject } from "./plugin-utils";

const virtualNextAppRouterComponentStubId = "\0vitest-plugin-rsc:next-app-router-component-stub";
const virtualNextServerInsertedHtmlStubId = "\0vitest-plugin-rsc:next-server-inserted-html-stub";
const virtualNextImageConfigContextStubId = "\0vitest-plugin-rsc:next-image-config-context-stub";

// Next's app-render module is a server renderer, but it imports a few client
// runtime modules while the Vite RSC client environment is using react-server
// conditions. Keep those compatibility redirects scoped here so the main plugin
// can stay focused on Vite/RSC wiring.
export function useNextAppRenderCompatibility(root = process.cwd()): Plugin[] {
  return [
    useNextAppRouterComponentStub(),
    useNextAppRenderReactDomServer(root),
    useNextServerInsertedHtmlStub(),
    useNextImageConfigContextStub(),
    useNextServerOnlyAlias(root),
  ];
}

function useNextAppRouterComponentStub(): Plugin {
  return {
    name: "next-rsc-app-router-component-stub",
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === "client";
    },
    resolveId(source, importer) {
      if (
        importer &&
        isNextAppRenderModule(importer) &&
        (source === "../../client/components/app-router" ||
          source === "../../client/components/app-router.js")
      ) {
        return virtualNextAppRouterComponentStubId;
      }

      if (source === virtualNextAppRouterComponentStubId) {
        return source;
      }
    },
    load(id) {
      if (id !== virtualNextAppRouterComponentStubId) return;

      return `
import { createElement } from "react";

export default function AppRouter() {
  return createElement("vitest-next-app-router-stub");
}
`;
    },
  };
}

function useNextAppRenderReactDomServer(root: string): Plugin {
  let reactDomServer = tryResolveFromProject(root, "react-dom/server.edge");
  let reactDomStatic = tryResolveFromProject(root, "react-dom/static.edge");

  return {
    name: "next-rsc-app-render-react-dom-server",
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === "client";
    },
    configResolved(config) {
      const projectRoot = getProjectRoot(config);
      reactDomServer = tryResolveFromProject(projectRoot, "react-dom/server.edge");
      reactDomStatic = tryResolveFromProject(projectRoot, "react-dom/static.edge");
    },
    resolveId(source, importer) {
      if (!importer || !isNextAppRenderServerModule(importer)) return;

      if (source === "react-dom/server" && reactDomServer) {
        return reactDomServer;
      }

      if (source === "react-dom/static" && reactDomStatic) {
        return reactDomStatic;
      }
    },
  };
}

function useNextServerInsertedHtmlStub(): Plugin {
  return {
    name: "next-rsc-server-inserted-html-stub",
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === "client";
    },
    resolveId(source, importer) {
      if (
        importer &&
        /[/\\]next[/\\]dist[/\\]server[/\\]app-render[/\\]server-inserted-html\.js(?:\?|$)/.test(
          importer,
        ) &&
        (source === "../../shared/lib/server-inserted-html.shared-runtime" ||
          source === "../../shared/lib/server-inserted-html.shared-runtime.js")
      ) {
        return virtualNextServerInsertedHtmlStubId;
      }

      if (source === virtualNextServerInsertedHtmlStubId) {
        return source;
      }
    },
    load(id) {
      if (id !== virtualNextServerInsertedHtmlStubId) return;

      return `
export const ServerInsertedHTMLContext = {
  Provider({ children }) {
    return children;
  },
};

export function useServerInsertedHTML(callback) {
}
`;
    },
  };
}

function useNextImageConfigContextStub(): Plugin {
  return {
    name: "next-rsc-image-config-context-stub",
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === "client";
    },
    resolveId(source, importer) {
      if (
        importer &&
        isNextAppRenderModule(importer) &&
        (source === "../../shared/lib/image-config-context.shared-runtime" ||
          source === "../../shared/lib/image-config-context.shared-runtime.js")
      ) {
        return virtualNextImageConfigContextStubId;
      }

      if (source === virtualNextImageConfigContextStubId) {
        return source;
      }
    },
    load(id) {
      if (id !== virtualNextImageConfigContextStubId) return;

      return `
export const ImageConfigContext = {
  Provider({ children }) {
    return children;
  },
};
`;
    },
  };
}

function useNextServerOnlyAlias(root: string): Plugin {
  let replacement = tryResolveFromProject(root, "next/dist/compiled/server-only/empty");

  return {
    name: "next-rsc-server-only-alias",
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === "client";
    },
    configResolved(config) {
      replacement = tryResolveFromProject(
        getProjectRoot(config),
        "next/dist/compiled/server-only/empty",
      );
    },
    resolveId(source) {
      if (source === "server-only" && replacement) {
        return replacement;
      }
    },
  };
}

function isNextAppRenderModule(id: string) {
  return /[/\\]next[/\\]dist[/\\]server[/\\]app-render[/\\]app-render\.js(?:\?|$)/.test(id);
}

function isNextAppRenderServerModule(id: string) {
  return /[/\\]next[/\\]dist[/\\]server[/\\]app-render[/\\].+\.js(?:\?|$)/.test(id);
}
