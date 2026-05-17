// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/client/script.tsx#L1-L28
// Adaptation: Vite RSC exposes Next's real Script module as an explicit client
// reference virtual module instead of relying on webpack layers.
// Begin adapted: Next.js script client reference
export function createNextScriptClientReferenceSource() {
  return `"use client";
export {
  default,
  handleClientScriptLoad,
  initScriptLoader,
} from "next/dist/client/script.js";
`;
}
// End adapted
