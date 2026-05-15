import fs from "node:fs";
import path from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
import { loadNextProjectConfig } from "./config";
import { createProjectRequire, getProjectRoot } from "./plugin-utils";

const virtualNextImageId = "virtual:vitest-plugin-rsc/next-image";
const virtualNextImageClientReferenceId = "virtual:vitest-plugin-rsc/next-image-client-reference";
const virtualNextStaticImagePrefix = "\0vitest-plugin-rsc:next-static-image:";
const staticImageFilePattern = /\.(?:png|jpg|jpeg|gif|webp|avif|ico|bmp|svg)$/i;
const cssImporterPattern = /\.(?:css|scss|sass|less|styl)(?:$|\?)/;

export function useNextImageClientReference(): Plugin {
  let root = process.cwd();
  let mode = "test";
  let command: ResolvedConfig["command"] = "serve";
  const devStaticAssets = new Map<string, { contentType: string; source: Buffer }>();

  return {
    name: "next-rsc-image-client-reference",
    enforce: "pre",
    configResolved(config) {
      root = getProjectRoot(config);
      mode = config.mode;
      command = config.command;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) {
          next();
          return;
        }

        const asset = devStaticAssets.get(new URL(req.url, "http://localhost").pathname);
        if (!asset) {
          next();
          return;
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", asset.contentType);
        res.end(asset.source);
      });
    },
    async resolveId(source, importer, options) {
      if (source === "next/image" || source === "next/image.js") {
        return virtualNextImageId;
      }

      if (source === virtualNextImageId || source === virtualNextImageClientReferenceId) {
        return source;
      }

      if (source.startsWith(virtualNextStaticImagePrefix)) {
        return source;
      }

      if (!importer || !staticImageFilePattern.test(source) || cssImporterPattern.test(importer)) {
        return;
      }

      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      const [imagePath] = (resolved?.id ?? source).split("?");
      if (!imagePath || !path.isAbsolute(imagePath) || !fs.existsSync(imagePath)) {
        return;
      }

      return `${virtualNextStaticImagePrefix}${encodeURIComponent(imagePath)}`;
    },
    async load(id) {
      if (id.startsWith(virtualNextStaticImagePrefix)) {
        const imagePath = decodeURIComponent(id.slice(virtualNextStaticImagePrefix.length));
        this.addWatchFile(imagePath);
        return loadNextStaticImage(root, mode, imagePath, {
          isDev: command !== "build",
          emitAsset:
            command === "build"
              ? (fileName, source) => this.emitFile({ type: "asset", fileName, source })
              : undefined,
          registerDevAsset(url, source) {
            devStaticAssets.set(new URL(url, "http://localhost").pathname, {
              contentType: getImageContentType(imagePath),
              source,
            });
          },
        });
      }

      if (id === virtualNextImageId) {
        return `import ImageDefault, { Image } from ${JSON.stringify(virtualNextImageClientReferenceId)};
import { getImgProps } from "next/dist/shared/lib/get-img-props.js";
import * as defaultLoaderModule from "next/dist/shared/lib/image-loader.js";

const defaultLoader =
  typeof defaultLoaderModule.default === "function"
    ? defaultLoaderModule.default
    : typeof defaultLoaderModule.default?.default === "function"
      ? defaultLoaderModule.default.default
      : defaultLoaderModule;

export { Image };
export default ImageDefault;

// Begin copy: Next.js next/image getImageProps implementation
// Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/shared/lib/image-external.tsx#L17-L38
// Adaptation: keep the callable helper in the RSC graph while Image itself
// remains a client reference.
export function getImageProps(imgProps) {
  const { props } = getImgProps(imgProps, {
    defaultLoader,
    imgConf: process.env.__NEXT_IMAGE_OPTS,
  });
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) {
      delete props[key];
    }
  }
  return { props };
}
// End copy
`;
      }

      if (id !== virtualNextImageClientReferenceId) return;

      return `"use client";
export { Image as default, Image } from "next/dist/client/image-component.js";
`;
    },
  };
}

type NextImageLoaderContext = {
  currentTraceSpan: NextTraceSpan;
  getOptions(): {
    compilerType: "client";
    isDev: boolean;
    assetPrefix: string;
    basePath: string;
  };
  rootContext: string;
  resourcePath: string;
  context: string;
  emitFile(name: string, content: Buffer, sourceMap: null): void;
};

type NextImageLoader = (this: NextImageLoaderContext, content: Buffer) => Promise<string> | string;

type NextTraceSpan = {
  traceChild(name: string): NextTraceSpan;
  traceAsyncFn<T>(fn: () => Promise<T> | T): Promise<T>;
  traceFn<T>(fn: () => T): T;
};

async function loadNextStaticImage(
  root: string,
  mode: string,
  imagePath: string,
  assets: {
    isDev: boolean;
    emitAsset?: (fileName: string, source: Buffer) => string;
    registerDevAsset(url: string, source: Buffer): void;
  },
) {
  const projectConfig = await loadNextProjectConfig(root, mode);
  const loaderModule = createProjectRequire(root)(
    "next/dist/build/webpack/loaders/next-image-loader/index.js",
  ) as { default?: NextImageLoader } | NextImageLoader;
  const loader = typeof loaderModule === "function" ? loaderModule : loaderModule.default;
  if (!loader) {
    throw new Error("Could not load Next image loader");
  }

  const emittedAssets = new Map<string, string>();
  const code = await loader.call(
    {
      currentTraceSpan: createNoopTraceSpan(),
      getOptions: () => ({
        compilerType: "client",
        isDev: assets.isDev,
        assetPrefix: projectConfig.assetPrefix,
        basePath: projectConfig.basePath,
      }),
      rootContext: root,
      resourcePath: imagePath,
      context: path.dirname(imagePath),
      emitFile(name, content) {
        const nextUrl = `${projectConfig.assetPrefix}/_next${name}`;

        if (!assets.emitAsset) {
          assets.registerDevAsset(nextUrl, content);
          return;
        }

        const fileName = path.posix.join("_next", name.replace(/^\/+/, ""));
        emittedAssets.set(nextUrl, assets.emitAsset(fileName, content));
      },
    },
    await fs.promises.readFile(imagePath),
  );

  return rewriteNextImageAssetUrls(code, emittedAssets);
}

function rewriteNextImageAssetUrls(code: string, emittedAssets: Map<string, string>) {
  let rewritten = code;

  for (const [nextUrl, referenceId] of emittedAssets) {
    rewritten = rewritten.replaceAll(
      JSON.stringify(nextUrl),
      `import.meta.ROLLUP_FILE_URL_${referenceId}`,
    );
  }

  return rewritten;
}

function getImageContentType(filePath: string) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".avif":
      return "image/avif";
    case ".ico":
      return "image/x-icon";
    case ".bmp":
      return "image/bmp";
    default:
      return "application/octet-stream";
  }
}

function createNoopTraceSpan(): NextTraceSpan {
  const span: NextTraceSpan = {
    traceChild: () => span,
    traceAsyncFn: (fn) => Promise.resolve(fn()),
    traceFn: (fn) => fn(),
  };
  return span;
}
