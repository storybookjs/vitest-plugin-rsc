import type { Plugin } from "vite";
import { createNextFormClientReferenceSource } from "./src/client/app-dir/form.ts";
import { createNextLinkClientReferenceSource } from "./src/client/app-dir/link.ts";
import { createNextLinkReactServerSource } from "./src/client/app-dir/link.react-server.ts";
import { createNextScriptClientReferenceSource } from "./src/client/script.ts";

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
        return createNextLinkReactServerSource(virtualNextLinkClientReferenceId);
      }

      if (id === virtualNextLinkClientReferenceId) {
        return createNextLinkClientReferenceSource();
      }

      if (id === virtualNextFormClientReferenceId) {
        return createNextFormClientReferenceSource();
      }

      if (id === virtualNextScriptClientReferenceId) {
        return createNextScriptClientReferenceSource();
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
