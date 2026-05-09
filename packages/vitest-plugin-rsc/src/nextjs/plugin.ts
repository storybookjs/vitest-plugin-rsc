import type { Plugin } from "vite";

const reactClientOptimizeDeps = [
  "next/dist/client/app-dir/link",
  "next/dist/client/app-dir/link.js",
  "next/dist/client/components/navigation",
  "next/dist/client/components/navigation.react-server",
  "next/dist/client/components/app-router-instance.js",
  "next/dist/client/components/navigation.js",
  "next/dist/client/components/navigation.react-server.js",
  "next/dist/client/components/redirect-boundary.js",
  "next/dist/client/components/router-reducer/compute-changed-path.js",
  "next/dist/client/components/router-reducer/create-initial-router-state.js",
  "next/dist/client/components/use-action-queue.js",
  "next/dist/shared/lib/app-router-context.shared-runtime.js",
  "next/dist/shared/lib/hooks-client-context.shared-runtime.js",
  "next/dist/shared/lib/server-inserted-html.shared-runtime.js",
];

const clientOptimizeDeps = [
  "next/headers",
  "next/dist/compiled/@edge-runtime/cookies/index.js",
  "next/dist/server/node-environment-baseline.js",
  "next/dist/server/app-render/action-async-storage.external.js",
  "next/dist/server/app-render/work-async-storage.external.js",
  "next/dist/server/app-render/work-unit-async-storage.external.js",
  "next/dist/client/components/is-next-router-error.js",
  "next/dist/client/app-dir/link.react-server",
  "next/dist/client/app-dir/link.react-server.js",
  "next/dist/server/request/cookies.js",
  "next/dist/server/request/headers.js",
  "next/dist/server/web/spec-extension/adapters/headers.js",
  "next/dist/server/web/spec-extension/adapters/request-cookies.js",
  "next/dist/shared/lib/server-inserted-html.shared-runtime.js",
  ...reactClientOptimizeDeps,
];

function appRouterApiPlugin(environmentName: string, aliases: Record<string, string>): Plugin {
  return {
    name: `next-rsc-app-router-api:${environmentName}`,
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === environmentName;
    },
    async resolveId(source, importer, options) {
      const replacement = aliases[source];
      if (!replacement) {
        return;
      }

      return this.resolve(replacement, importer, {
        ...options,
        skipSelf: true,
      });
    },
  };
}

export function vitestPluginNext(): Plugin[] {
  return [
    appRouterApiPlugin("client", {
      "next/link": "next/dist/client/app-dir/link.react-server",
      "next/navigation": "next/dist/client/components/navigation.react-server",
    }),
    appRouterApiPlugin("react_client", {
      "next/link": "next/dist/client/app-dir/link",
      "next/navigation": "next/dist/client/components/navigation",
    }),
    {
      name: "next-rsc-plugin",
      config() {
        return {
          define: {
            "process.env": JSON.stringify({}),
            __dirname: JSON.stringify(null),
          },
          resolve: {
            alias: {
              "next/cache": "vitest-plugin-rsc/nextjs/cache",
              "@vercel/turbopack-ecmascript-runtime/browser/dev/hmr-client/hmr-client.ts":
                "next/dist/client/dev/noop-turbopack-hmr",
              "react-server-dom-webpack/client":
                "@vitejs/plugin-rsc/vendor/react-server-dom/client.edge",
            },
          },
          environments: {
            client: {
              optimizeDeps: {
                include: clientOptimizeDeps,
                exclude: ["next/cache"],
                rolldownOptions: {
                  resolve: {
                    alias: {
                      "next/link": "next/dist/client/app-dir/link.react-server",
                      "next/navigation": "next/dist/client/components/navigation.react-server",
                    },
                  },
                },
              },
            },
            react_client: {
              optimizeDeps: {
                include: reactClientOptimizeDeps,
                exclude: ["next/cache"],
                rolldownOptions: {
                  resolve: {
                    alias: {
                      "next/link": "next/dist/client/app-dir/link",
                      "next/navigation": "next/dist/client/components/navigation",
                    },
                  },
                },
              },
            },
          },
        };
      },
    },
  ];
}
