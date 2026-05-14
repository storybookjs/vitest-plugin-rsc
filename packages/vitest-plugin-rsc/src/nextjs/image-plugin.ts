import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { createProjectRequire, getProjectRoot } from "./plugin-utils";

const virtualNextImageId = "virtual:vitest-plugin-rsc/next-image";
const virtualNextImageClientReferenceId = "virtual:vitest-plugin-rsc/next-image-client-reference";
const virtualNextStaticImagePrefix = "\0vitest-plugin-rsc:next-static-image:";
const staticImageFilePattern = /\.(?:png|jpg|jpeg|gif|webp|avif|ico|bmp|svg)$/i;
const cssImporterPattern = /\.(?:css|scss|sass|less|styl)(?:$|\?)/;

export function useNextImageClientReference(): Plugin {
  let root = process.cwd();

  return {
    name: "next-rsc-image-client-reference",
    enforce: "pre",
    configResolved(config) {
      root = getProjectRoot(config);
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
        return loadNextStaticImage(root, imagePath);
      }

      if (id === virtualNextImageId) {
        return `import ImageDefault, { Image } from ${JSON.stringify(virtualNextImageClientReferenceId)};
import { getImgProps } from "next/dist/shared/lib/get-img-props.js";
import defaultLoader from "next/dist/shared/lib/image-loader.js";

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
    isDev: true;
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

async function loadNextStaticImage(root: string, imagePath: string) {
  const loaderModule = createProjectRequire(root)(
    "next/dist/build/webpack/loaders/next-image-loader/index.js",
  ) as { default?: NextImageLoader } | NextImageLoader;
  const loader = typeof loaderModule === "function" ? loaderModule : loaderModule.default;
  if (!loader) {
    throw new Error("Could not load Next image loader");
  }

  return loader.call(
    {
      currentTraceSpan: createNoopTraceSpan(),
      getOptions: () => ({
        compilerType: "client",
        isDev: true,
        assetPrefix: "",
        basePath: "",
      }),
      rootContext: root,
      resourcePath: imagePath,
      context: path.dirname(imagePath),
      emitFile() {},
    },
    await fs.promises.readFile(imagePath),
  );
}

function createNoopTraceSpan(): NextTraceSpan {
  const span: NextTraceSpan = {
    traceChild: () => span,
    traceAsyncFn: (fn) => Promise.resolve(fn()),
    traceFn: (fn) => fn(),
  };
  return span;
}
