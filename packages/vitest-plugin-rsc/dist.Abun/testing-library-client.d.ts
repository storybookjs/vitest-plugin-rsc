import { t as RenderConfiguration } from "./testing-library-KtmvvbCk.js";
import * as React from "react";

//#region src/testing-library-client.d.ts
type RscPayload = {
  root: React.ReactNode;
  returnValue?: unknown;
};
type TestingLibraryClientRoot = Awaited<ReturnType<typeof createTestingLibraryClientRoot>>;
type FetchRsc = (actionRequest?: {
  id: string;
  reply: string | FormData;
}) => Promise<ReadableStream<Uint8Array>>;
declare function createTestingLibraryClientRoot(options: {
  container: HTMLElement;
  config: RenderConfiguration;
  fetchRsc: FetchRsc;
}): Promise<{
  rerender: () => Promise<void>;
  unmount: () => Promise<void>;
}>;
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
declare function initialize(): void;
//#endregion
export { FetchRsc, RscPayload, TestingLibraryClientRoot, createTestingLibraryClientRoot, initialize };