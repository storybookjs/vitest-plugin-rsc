// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/shared/lib/image-config-context.shared-runtime.ts
// Adaptation: App render needs the ImageConfigContext provider import while
// running in the Vite RSC environment; image config values are supplied through
// render opts instead of a mounted browser provider.
// Begin adapted: Next.js image config context compatibility source
export function createNextImageConfigContextStubSource() {
  return `
export const ImageConfigContext = {
  Provider({ children }) {
    return children;
  },
};
`;
}
// End adapted
