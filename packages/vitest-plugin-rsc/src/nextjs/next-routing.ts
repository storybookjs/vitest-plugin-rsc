// `@next/routing@16.2` is published as a CJS bundle whose runtime shape is a
// default object, while its declarations expose named exports.
//
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next-routing/src/index.ts
// Adaptation: keep that package-shape bridge in one place so request routing
// code can import stable named bindings without defensive runtime branches.
import nextRouting from "@next/routing";
import type * as NextRouting from "@next/routing";

export const { resolveRoutes } = nextRouting as typeof NextRouting;
