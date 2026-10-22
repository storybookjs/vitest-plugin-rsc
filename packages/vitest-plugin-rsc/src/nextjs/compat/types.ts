// The types of Next that the plugin's modules in Node.js take: of the config,
// of what its build hands a deployment adapter, and of what its loaders and
// manifests are made of. Types only: nothing of Next loads by them.

export type { RoutesManifest } from "next/dist/build/index.js";
export type { AdapterOutputs } from "next/dist/build/adapter/build-complete.js";
export type { ProxyMatcher } from "next/dist/build/analysis/get-page-static-info.js";
export type { AppLoaderOptions } from "next/dist/build/webpack/loaders/next-app-loader/index.js";
export type {
  EdgeFunctionDefinition,
  MiddlewareManifest,
} from "next/dist/build/webpack/plugins/middleware-plugin.js";
export type { Header } from "next/dist/lib/load-custom-routes.js";
export type { NextConfigComplete } from "next/dist/server/config-shared.js";
