import type { Plugin } from "vite";

const virtualNextBuiltinGlobalErrorStubPublicId =
  "virtual:vitest-plugin-rsc/next-builtin-global-error-stub";
const virtualNextBuiltinGlobalErrorStubId = `\0${virtualNextBuiltinGlobalErrorStubPublicId}`;

export function useNextBuiltinGlobalErrorStub(): Plugin {
  return {
    name: "next-rsc-builtin-global-error-stub",
    enforce: "pre",
    resolveId(source) {
      if (source !== virtualNextBuiltinGlobalErrorStubPublicId) return;
      return virtualNextBuiltinGlobalErrorStubId;
    },
    load(id) {
      if (id !== virtualNextBuiltinGlobalErrorStubId) return;

      // Mirrors Next's built-in app/global-error fallback shape when the app
      // does not provide a global-error module.
      // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/client/components/builtin/global-error.tsx
      return `"use client";
export default function GlobalError() {
  return null;
}
`;
    },
  };
}
