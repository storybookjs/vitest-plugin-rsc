import type { ReactNode } from "react";
import { renderServer as baseRenderServer } from "vitest-plugin-rsc/nextjs/testing-library";

type RenderServerOptions = NonNullable<Parameters<typeof baseRenderServer>[1]>;

export async function renderServer(
  ui: ReactNode,
  { route, url = "/", ...options }: RenderServerOptions & { route?: string; url?: string } = {},
) {
  return baseRenderServer(ui, {
    ...options,
    route,
    url,
  });
}
