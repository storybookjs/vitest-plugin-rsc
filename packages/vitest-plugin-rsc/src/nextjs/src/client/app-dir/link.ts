// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/client/app-dir/link.tsx#L1-L25
// Adaptation: Vite RSC exposes Next's real app-dir Link module as an explicit
// client reference virtual module instead of relying on webpack layers.
// Begin adapted: Next.js app-dir link client reference
export function createNextLinkClientReferenceSource() {
  return `"use client";
export { default, useLinkStatus } from "next/dist/client/app-dir/link.js";
`;
}
// End adapted
