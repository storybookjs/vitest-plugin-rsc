import type { Plugin } from "vite";

const virtualNextLinkReactServerId = "virtual:vitest-plugin-rsc/next-link-react-server";
const virtualNextLinkClientReferenceId = "virtual:vitest-plugin-rsc/next-link-client-reference";
const virtualNextFormClientReferenceId = "virtual:vitest-plugin-rsc/next-form-client-reference";
const virtualNextScriptClientReferenceId = "virtual:vitest-plugin-rsc/next-script-client-reference";

export function useNextLinkClientReference(): Plugin {
  return {
    name: "next-rsc-link-client-reference",
    enforce: "pre",
    resolveId(source, importer) {
      const isRscEnvironment = getHookEnvironmentName(this) === "client";

      if (
        isRscEnvironment &&
        (source === "next/link" ||
          source === "next/link.js" ||
          source === "next/dist/client/app-dir/link.react-server" ||
          source === "next/dist/client/app-dir/link.react-server.js")
      ) {
        return virtualNextLinkReactServerId;
      }

      if (
        importer &&
        (isNextLinkReactServerModule(importer) || importer === virtualNextLinkReactServerId) &&
        (source === "./link" || source === "./link.js")
      ) {
        return virtualNextLinkClientReferenceId;
      }

      if (isRscEnvironment && (source === "next/form" || source === "next/form.js")) {
        return virtualNextFormClientReferenceId;
      }

      if (source === "next/script" || source === "next/script.js") {
        return virtualNextScriptClientReferenceId;
      }

      if (stripQuery(source) === virtualNextLinkReactServerId) {
        return virtualNextLinkReactServerId;
      }

      if (stripQuery(source) === virtualNextLinkClientReferenceId) {
        return virtualNextLinkClientReferenceId;
      }

      if (stripQuery(source) === virtualNextFormClientReferenceId) {
        return virtualNextFormClientReferenceId;
      }

      if (stripQuery(source) === virtualNextScriptClientReferenceId) {
        return virtualNextScriptClientReferenceId;
      }

      if (
        source === virtualNextLinkReactServerId ||
        source === virtualNextFormClientReferenceId ||
        source === virtualNextScriptClientReferenceId
      ) {
        return source;
      }
    },
    load(id) {
      id = stripQuery(id);

      if (id === virtualNextLinkReactServerId) {
        return `
import { jsx } from "react/jsx-runtime";
import Link, { useLinkStatus } from ${JSON.stringify(virtualNextLinkClientReferenceId)};

export { useLinkStatus };

export default function LinkComponent(props) {
  const isLegacyBehavior = props.legacyBehavior;
  const childIsHostComponent =
    typeof props.children === "string" ||
    typeof props.children === "number" ||
    typeof props.children?.type === "string";
  const childIsClientComponent = props.children?.type?.$$typeof === Symbol.for("react.client.reference");
  if (isLegacyBehavior && !childIsHostComponent && !childIsClientComponent) {
    if (props.children?.type?.$$typeof === Symbol.for("react.lazy")) {
      console.error("Using a Lazy Component as a direct child of next/link with legacyBehavior from a Server Component is not supported.");
    } else {
      console.error("Using a Server Component as a direct child of next/link with legacyBehavior is not supported.");
    }
  }
  return jsx(Link, { ...props });
}
`;
      }

      if (id === virtualNextLinkClientReferenceId) {
        return `"use client";
export { default, useLinkStatus } from "next/dist/client/app-dir/link.js";
`;
      }

      if (id === virtualNextFormClientReferenceId) {
        return `"use client";
export { default } from "next/dist/client/app-dir/form.js";
`;
      }

      if (id === virtualNextScriptClientReferenceId) {
        return `"use client";
export {
  default,
  handleClientScriptLoad,
  initScriptLoader,
} from "next/dist/client/script.js";
`;
      }
    },
  };
}

function isNextLinkReactServerModule(id: string) {
  return /[/\\]next[/\\]dist[/\\]client[/\\]app-dir[/\\]link\.react-server\.js(?:\?|$)/.test(id);
}

function stripQuery(id: string) {
  return id.replace(/\?.*$/, "");
}

function getHookEnvironmentName(context: unknown) {
  return (context as { environment?: { name?: string } }).environment?.name;
}
