// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/shared/lib/server-inserted-html.shared-runtime.tsx
// Adaptation: App render imports the server-inserted HTML context while
// evaluated in the Vite RSC environment. Vitest owns the outer document, so the
// provider is a pass-through and callback registration is intentionally inert.
// Begin adapted: Next.js server-inserted HTML context compatibility source
export function createNextServerInsertedHtmlStubSource() {
  return `
export const ServerInsertedHTMLContext = {
  Provider({ children }) {
    return children;
  },
};

export function useServerInsertedHTML(callback) {
}
`;
}
// End adapted
