// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/client/app-dir/form.tsx
// Adaptation: Vite RSC exposes Next's real app-dir Form module as an explicit
// client reference virtual module instead of relying on webpack layers.
// Begin adapted: Next.js app-dir form client reference
export function createNextFormClientReferenceSource() {
  return `"use client";
export { default } from "next/dist/client/app-dir/form.js";
`;
}
// End adapted
