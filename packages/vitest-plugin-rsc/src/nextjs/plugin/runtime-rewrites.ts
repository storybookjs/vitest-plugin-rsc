import type { Plugin } from "vite";

export function provideBufferLikeNextWebpack(): Plugin {
  return {
    name: "next-rsc-edge-provide-buffer",
    enforce: "pre",
    transform(code, id) {
      if (
        !id.includes("/next/dist/") ||
        id.includes("/next/dist/compiled/buffer/") ||
        id.includes("/next/dist/server/stream-utils/uint8array-helpers") ||
        !/\bBuffer\b/.test(code)
      ) {
        return;
      }

      // Mirrors Next's webpack ProvidePlugin for Buffer in client and edge
      // bundles. Vite has no direct ProvidePlugin equivalent, so this import is
      // scoped to installed Next internals.
      // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/webpack-config.ts#L2028-L2035
      return {
        code: `import { Buffer } from "node:buffer";\n${code}`,
        map: null,
      };
    },
  };
}

export function treatNextInternalsAsServerInRsc(): Plugin {
  return {
    name: "next-rsc-server-next-internals",
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === "client";
    },
    transform(code, id) {
      if (!isNextInternalModule(id)) return;

      // Next compiles server-layer internals with server/edge constants through
      // its compiler define pipeline. Vite RSC defines the same values, but dep
      // optimization can evaluate Next internals before Vite's normal define
      // pass removes browser branches. Keep this rewrite isolated to installed
      // Next internals until it can be replaced by optimizer define/conditions.
      // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/define-env.ts
      let nextCode = rewriteNextRuntimeChecks(code);
      nextCode = rewriteTypeofWindowChecks(nextCode);
      if (nextCode === code) return;

      return { code: nextCode, map: null };
    },
  };
}

export function disableNextDevServerRuntime(): Plugin {
  return {
    name: "next-rsc-disable-next-dev-server-runtime",
    enforce: "pre",
    transform(code, id) {
      if (!isNextInternalModule(id)) return;

      // Next dev-server-only branches are removed by Next's compiler/runtime
      // environment. Component tests do not run Next's dev server process, so
      // resolve those checks the same way for installed Next internals.
      // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/define-env.ts
      const nextCode = rewriteNextDevServerChecks(code);
      if (nextCode === code) return;

      return { code: nextCode, map: null };
    },
  };
}

function isNextInternalModule(id: string) {
  return (
    /[/\\]next[/\\]dist[/\\]/.test(id) &&
    !/[/\\]next[/\\]dist[/\\]compiled[/\\]/.test(id) &&
    !/[/\\]node_modules[/\\]\.vite[/\\]/.test(id)
  );
}

function rewriteTypeofWindowChecks(code: string) {
  return code.replace(/\btypeof\s+window\b(?!\s*[.[\]])/g, '"undefined"');
}

function rewriteNextRuntimeChecks(code: string) {
  return code.replace(/\bprocess\.env\.NEXT_RUNTIME\b/g, '"edge"');
}

function rewriteNextDevServerChecks(code: string) {
  return code.replace(/\bprocess\.env\.__NEXT_DEV_SERVER\b/g, "false");
}
