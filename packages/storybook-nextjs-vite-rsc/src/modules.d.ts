// What the framework imports that comes without types.

// The argTypes of a React component, from its docgen: React-free.
declare module "@storybook/react/entry-preview-argtypes" {
  import type { ArgTypesEnhancer, Parameters } from "storybook/internal/types";

  export const argTypesEnhancers: ArgTypesEnhancer[];
  export const parameters: Parameters;
}

// The `env` of the preset, which Storybook's Vite builder defines.
interface ImportMeta {
  readonly env: { readonly STORYBOOK_NEXTJS_RSC_WORKING_DIR?: string };
}
