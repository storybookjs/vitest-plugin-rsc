import preview from "../.storybook/preview.ts";
import { RouteParams } from "../app/components/route-params.tsx";

// A story of a component at a URL that proxy.ts rewrites: `/latest` is the
// route of `/notes/7`.
const meta = preview.meta({
  title: "Server/RouteParams",
  component: RouteParams,
  parameters: { nextjs: { url: "/latest" } },
});

// Without the proxy, which a story of a component skips: no route of the
// app has `/latest`, so it has no params.
export const Default = meta.story();

// Through the proxy, whose rewrite decides the route.
export const ThroughTheProxy = meta.story({
  parameters: { nextjs: { url: "/latest", proxy: true } },
});
