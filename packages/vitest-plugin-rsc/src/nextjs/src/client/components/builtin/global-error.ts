import type { Plugin } from "vite";

// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/client/components/builtin/global-error.tsx#L1-L61
// Adaptation: Next's built-in global-error module is a client component
// reference in the loader tree. The Vite RSC harness needs a virtual client
// module with that reference shape; the local test renderer supplies the
// fallback error UI outside this stub.
// Begin adapted: Next.js builtin global-error client reference stub
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
// End adapted
