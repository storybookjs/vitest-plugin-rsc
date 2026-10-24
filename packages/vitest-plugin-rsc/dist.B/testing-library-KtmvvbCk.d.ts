import { JSXElementConstructor, ReactNode } from "react";
import { RootOptions } from "react-dom/client";

//#region src/testing-library.d.ts
declare function renderServer(ui: ReactNode, {
  container,
  baseElement,
  wrapper: WrapperComponent
}?: {
  container?: HTMLElement;
  baseElement?: HTMLElement;
  wrapper?: JSXElementConstructor<{
    children: ReactNode;
  }>;
}): Promise<{
  container: HTMLElement;
  baseElement: HTMLElement;
  unmount: () => Promise<void>;
  rerender: (ui: ReactNode) => Promise<void>;
  asFragment: () => DocumentFragment;
}>;
declare function cleanup(): Promise<void>;
interface RenderConfiguration {
  reactStrictMode: boolean;
  rootOptions: RootOptions;
}
declare function initialize(customConfig?: Partial<RenderConfiguration>): void;
//#endregion
export { renderServer as i, cleanup as n, initialize as r, RenderConfiguration as t };