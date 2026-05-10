import type { ReactNode } from "react";
import {
  renderServer as baseRenderServer,
  NextRouter,
} from "vitest-plugin-rsc/nextjs/testing-library";
import RootLayout from "#app/layout.tsx";

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
  return baseRenderServer(
    <NextRouter route={route} url={url}>
      <RootLayout>
        {ui}
      </RootLayout>
    </NextRouter>,
    {
      ...options,
      url,
      wrapper: Wrapper,
    },
  );
}
