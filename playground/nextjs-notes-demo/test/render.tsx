import type { ReactNode } from "react";
import { renderServer as baseRenderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { AppShell } from "#app/layout.tsx";

type RenderServerOptions = NonNullable<Parameters<typeof baseRenderServer>[1]>;

export async function renderServer(
  ui: ReactNode,
  {
    route,
    url = "/",
    wrapper: Wrapper,
    ...options
  }: RenderServerOptions & { route?: string; url?: string } = {},
) {
  function AppWrapper({ children }: { children: ReactNode }) {
    const content = <AppShell>{children}</AppShell>;
    return Wrapper ? <Wrapper>{content}</Wrapper> : content;
  }

  return baseRenderServer(ui, {
    ...options,
    route,
    url,
    wrapper: AppWrapper,
  });
}
