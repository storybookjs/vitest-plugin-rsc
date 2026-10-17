// SB-2260: what a `.storybook/main.ts` imports from the framework, like its
// `StorybookConfig` type. Storybook itself loads `./preset` and `./preview`.
// A placeholder until then.
export type FrameworkOptions = Record<string, never>;
