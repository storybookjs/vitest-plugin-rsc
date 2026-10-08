import { RouteParams } from "../app/components/route-params.tsx";

// A story of a component at a URL that proxy.ts rewrites: `/latest` is the
// route of `/notes/7`.
export default {
  title: "Server/RouteParams",
  component: RouteParams,
  parameters: { nextjs: { url: "/latest" } },
};

// Without the proxy, which a story of a component skips: no route of the
// app has `/latest`, so it has no params.
export const Default = {};

// Through the proxy, whose rewrite decides the route.
export const ThroughTheProxy = { parameters: { nextjs: { url: "/latest", proxy: true } } };
