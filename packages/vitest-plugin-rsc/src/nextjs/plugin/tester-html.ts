import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin, UserConfig } from "vite";

export const nextTesterHtmlPath = resolveNextTesterHtmlPath();

type VitestBrowserConfig = {
  enabled?: boolean;
  testerHtmlPath?: string;
  instances?: Array<{
    testerHtmlPath?: string;
  }>;
};

type VitestUserConfig = UserConfig & {
  test?: {
    browser?: false | VitestBrowserConfig;
  };
};

export function createNextTesterHtmlConfig(config: UserConfig): UserConfig {
  const browser = (config as VitestUserConfig).test?.browser;
  if (browser === false || hasTesterHtmlPath(browser)) {
    return {};
  }

  return {
    test: {
      browser: {
        testerHtmlPath: nextTesterHtmlPath,
      },
    },
  } as UserConfig;
}

export function useNextBrowserPolyfills(): Plugin {
  return {
    name: "next-rsc-browser-polyfills",
    enforce: "pre",
    transformIndexHtml: {
      order: "pre",
      handler(_html, context) {
        if (context.filename !== nextTesterHtmlPath) {
          return;
        }

        return [
          {
            tag: "script",
            attrs: {
              type: "module",
              src: "/@id/vitest-plugin-rsc/nextjs/browser-polyfills",
              "data-vitest-plugin-rsc-next-baseline": "",
            },
            injectTo: "head-prepend",
          },
        ];
      },
    },
  };
}

function hasTesterHtmlPath(browser: VitestBrowserConfig | undefined): boolean {
  return (
    typeof browser?.testerHtmlPath === "string" ||
    browser?.instances?.some((instance) => typeof instance.testerHtmlPath === "string") === true
  );
}

function resolveNextTesterHtmlPath() {
  const candidates = [
    fileURLToPath(new URL("../tester.html", import.meta.url)),
    fileURLToPath(new URL("./tester.html", import.meta.url)),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0]!;
}
