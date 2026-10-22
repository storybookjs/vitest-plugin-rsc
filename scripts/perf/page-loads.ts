/// <reference types="node" />

import os from "node:os";
import path from "node:path";
import type { Browser, BrowserContext, CDPSession, Page } from "playwright";
import { serveFiles, type Site } from "../../playground/test-helpers/serve-files.ts";
import { list } from "./utils.ts";

// How the page load benchmarks of a static build load a page and read its
// requests: from which host, over which network, in which order, what CDP's
// Network domain sees of the requests, and what they say of the load: its
// bytes, its round trips, its layers. `pnpm perf:static` loads the host of
// the e2e demo, `pnpm perf:storybook` the Storybook of the notes demo. See
// docs/internals/performance.md.

/**
 * The network a page loads over. `local` is localhost as it is: a request
 * costs next to nothing, so the times are about the CPU. `cable` is a fast
 * line, as CDP emulates one: 50 Mbit/s down, 10 up, and 20 ms more for every
 * request. It shows what a round trip costs.
 */
export const profiles = {
  local: undefined,
  cable: {
    offline: false,
    latency: 20,
    downloadThroughput: 50e6 / 8,
    uploadThroughput: 10e6 / 8,
  },
} as const;

export type Profile = keyof typeof profiles;

export function profilesOption(value: string | undefined): Profile[] {
  const names = list(value) ?? Object.keys(profiles);
  return names.map((name) => {
    if (!(name in profiles)) {
      throw new Error(`--profiles takes ${Object.keys(profiles).join(" and ")}, not "${name}".`);
    }
    return name as Profile;
  });
}

// The files that a build names with a hash of their content, as
// docs/static-build.md has a static host serve them: Vite's, Next's and those
// of the plugin's layers. The browser keeps them without asking again.
export const hashed = /^(assets|_next\/static|vitest-plugin-rsc\/[^/]+\/assets)\//;

/**
 * Serves a build as docs/static-build.md has a static host serve it:
 * compressed, the files of `hashed` immutable, and any other file with an
 * ETag and `no-cache`, so a warm load asks for it again and gets a 304.
 */
export function serveBuild(dir: string): Promise<Site> {
  return serveFiles(dir, "/", { cache: { hashed }, compress: true });
}

export type Kind =
  | "modules.json"
  | "html"
  | "js"
  | "css"
  | "fonts"
  | "images"
  | "wasm"
  | "json"
  | "other";

export const kinds: readonly Kind[] = [
  "modules.json",
  "js",
  "css",
  "fonts",
  "images",
  "wasm",
  "html",
  "json",
  "other",
];

export function kindOf(pathname: string): Kind {
  if (pathname.endsWith("/modules.json")) return "modules.json";
  const extension = path.posix.extname(pathname);
  if (extension === ".html" || pathname.endsWith("/")) return "html";
  if (extension === ".js" || extension === ".mjs") return "js";
  if (extension === ".css") return "css";
  if ([".woff2", ".woff", ".ttf", ".otf"].includes(extension)) return "fonts";
  if ([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif", ".ico"].includes(extension)) {
    return "images";
  }
  if (extension === ".wasm") return "wasm";
  if (extension === ".json") return "json";
  return "other";
}

/** The layer whose `modules.json` a path is, like `next_ssr`. */
export function layerOf(pathname: string): string | undefined {
  return /\/vitest-plugin-rsc\/([^/]+)\/modules\.json$/.exec(pathname)?.[1];
}

/** How the browser got a file: over the network, as a 304, or from its cache. */
export type Source = "network" | "revalidated" | "disk-cache" | "memory-cache";

export type RequestRecord = {
  path: string;
  kind: Kind;
  status: number;
  source: Source;
  /** What came over the wire, headers included: CDP's `encodedDataLength`. */
  transferBytes: number;
  /** The size of the file in the build, whether or not it came over the wire. */
  resourceBytes: number;
  startMs: number;
  endMs: number | undefined;
};

/** The requests of `layerOf()` files, by layer: how many, how many were 304s, and when the last ended. */
export type LayerRequests = Record<
  string,
  { requests: number; revalidated: number; endMs: number | undefined }
>;

export function layerRequestsOf(requests: RequestRecord[]): LayerRequests {
  const layers: LayerRequests = {};
  for (const request of requests) {
    const layer = layerOf(request.path);
    if (!layer) continue;
    const of = (layers[layer] ??= { requests: 0, revalidated: 0, endMs: undefined });
    of.requests += 1;
    if (request.source === "revalidated") of.revalidated += 1;
    if (request.endMs !== undefined) of.endMs = Math.max(of.endMs ?? 0, request.endMs);
  }
  return layers;
}

export type ByKind = Record<
  Kind,
  { requests: number; transferBytes: number; resourceBytes: number }
>;

export function byKindOf(requests: RequestRecord[]): ByKind {
  const byKind = Object.fromEntries(
    kinds.map((kind) => [kind, { requests: 0, transferBytes: 0, resourceBytes: 0 }]),
  ) as ByKind;
  for (const request of requests) {
    byKind[request.kind].requests += 1;
    byKind[request.kind].transferBytes += request.transferBytes;
    byKind[request.kind].resourceBytes += request.resourceBytes;
  }
  return byKind;
}

/**
 * The serial waves of requests to the server: the ones the page could ask for
 * at once. A request that starts after one of the wave has ended may have
 * waited for it, and starts the next wave. One that the cache answered costs
 * no round trip.
 */
export function wavesOf(requests: RequestRecord[]): number {
  let waves = 0;
  let firstEnd = -Infinity;
  const sent = requests.filter(
    (request) => request.source === "network" || request.source === "revalidated",
  );
  for (const request of sent.sort((a, b) => a.startMs - b.startMs)) {
    const end = request.endMs ?? Infinity;
    if (request.startMs >= firstEnd) {
      waves += 1;
      firstEnd = end;
    } else {
      firstEnd = Math.min(firstEnd, end);
    }
  }
  return waves;
}

/**
 * What a load until `untilMs` waited for, in two parts. Transfer-bound: the
 * time the bytes on the wire take at the download rate of the profile, of
 * the requests that ended by then; none on localhost. Chain-bound: the serial
 * waves of the requests that started by then, and the time between them in
 * which no request was in flight, the page working out what to ask for next.
 */
export type TransferAndChain = { wireMs: number | undefined; waves: number; idleMs: number };

export function transferAndChainOf(
  requests: RequestRecord[],
  untilMs: number,
  profile: Profile,
): TransferAndChain {
  const started = requests.filter((request) => request.startMs < untilMs);
  const rate = profiles[profile]?.downloadThroughput;
  const bytes = started
    .filter((request) => request.endMs !== undefined && request.endMs <= untilMs)
    .reduce((total, request) => total + request.transferBytes, 0);
  let idleMs = 0;
  let busyUntil: number | undefined;
  for (const request of [...started].sort((a, b) => a.startMs - b.startMs)) {
    if (busyUntil !== undefined && request.startMs > busyUntil) {
      idleMs += request.startMs - busyUntil;
    }
    busyUntil = Math.max(busyUntil ?? -Infinity, Math.min(request.endMs ?? untilMs, untilMs));
  }
  return {
    wireMs: rate === undefined ? undefined : (bytes / rate) * 1000,
    waves: wavesOf(started),
    idleMs,
  };
}

/**
 * When the host's own first request to `pathname` started, after the end of
 * the ssr layer's `modules.json`: negative when it did not wait for the layer.
 */
export function hostRequestAfterSsrOf(
  requests: RequestRecord[],
  pathname: string,
): number | undefined {
  const starts = requests
    .filter((request) => request.path.split("?")[0] === pathname)
    .map((request) => request.startMs);
  const start = starts.length > 0 ? Math.min(...starts) : undefined;
  const ssrEnd = layerRequestsOf(requests).next_ssr?.endMs;
  return start === undefined || ssrEnd === undefined ? undefined : start - ssrEnd;
}

/**
 * Numbers in [0, 1) from a seed, mulberry32: the same seed, the same numbers.
 * Loads take turns in an order of them, iteration by iteration, so that a
 * slow minute of the machine falls on no load in particular, and a run can be
 * made again as it was.
 */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

/** The items in an order of `random`. */
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const order = [...items];
  for (let index = order.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [order[index], order[other]] = [order[other]!, order[index]!];
  }
  return order;
}

type CdpRequest = {
  url: string;
  start: number;
  status?: number;
  sentStatus?: number;
  fromDiskCache?: boolean;
  fromMemoryCache?: boolean;
  end?: number;
  transferBytes: number;
  failed?: string;
};

export type Network = {
  cdp: CDPSession;
  /**
   * Resolves once no request has been in flight for 500 ms, or after 10 s,
   * with the number of requests still loading.
   */
  quiet(): Promise<number>;
  /**
   * The requests until now, in ms from the start of the navigation. The ones
   * of the site by their path, with the size of the file that `sizeOf` gives,
   * the others by their URL. A failed one or an error of the server goes to
   * `errors` too.
   */
  requests(
    site: Site,
    sizeOf: (file: string) => number | undefined,
    errors: string[],
  ): Promise<RequestRecord[]>;
};

/**
 * Loads a page over `profile`, and watches its requests in CDP's Network
 * domain, not with Playwright's `response` event: it says what came over the
 * wire and what came from the cache, without reading bodies.
 */
export async function watchNetwork(
  context: BrowserContext,
  page: Page,
  profile: Profile,
): Promise<Network> {
  const cdp = await context.newCDPSession(page);
  const requests = new Map<string, CdpRequest>();
  let inFlight = 0;
  let lastActivity = performance.now();
  const settle = () => {
    inFlight -= 1;
    lastActivity = performance.now();
  };
  cdp.on("Network.requestWillBeSent", (event) => {
    if (!event.request.url.startsWith("http")) return;
    // A redirect sends the request again under its id.
    if (!requests.has(event.requestId)) inFlight += 1;
    requests.set(event.requestId, {
      url: event.request.url,
      start: event.timestamp,
      transferBytes: 0,
    });
    lastActivity = performance.now();
  });
  cdp.on("Network.requestServedFromCache", (event) => {
    const request = requests.get(event.requestId);
    if (request) request.fromMemoryCache = true;
  });
  cdp.on("Network.responseReceived", (event) => {
    const request = requests.get(event.requestId);
    if (!request) return;
    request.status = event.response.status;
    request.fromDiskCache = event.response.fromDiskCache;
  });
  // The response gives the status of the copy in the cache, a 200, for one
  // that the server answered with a 304. The status the server sent is here,
  // which can come before the response.
  const sentStatuses = new Map<string, number>();
  cdp.on("Network.responseReceivedExtraInfo", (event) =>
    sentStatuses.set(event.requestId, event.statusCode),
  );
  cdp.on("Network.loadingFinished", (event) => {
    const request = requests.get(event.requestId);
    if (!request || request.end !== undefined) return;
    request.end = event.timestamp;
    request.transferBytes = event.encodedDataLength;
    settle();
  });
  cdp.on("Network.loadingFailed", (event) => {
    const request = requests.get(event.requestId);
    if (!request || request.end !== undefined) return;
    request.end = event.timestamp;
    request.failed = event.errorText;
    settle();
  });
  await cdp.send("Network.enable");
  const conditions = profiles[profile];
  if (conditions) await cdp.send("Network.emulateNetworkConditions", conditions);
  await cdp.send("Performance.enable");

  return {
    cdp,
    async quiet() {
      const quietSince = performance.now();
      while (
        (inFlight > 0 || performance.now() - lastActivity < 500) &&
        performance.now() - quietSince < 10_000
      ) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return inFlight;
    },
    async requests(site, sizeOf, errors) {
      // The page counts from the start of the navigation, CDP from a start of
      // its own: CDP has the start of the navigation on its clock.
      const all = [...requests.values()];
      const { metrics } = await cdp.send("Performance.getMetrics");
      const navigationStart =
        metrics.find((entry) => entry.name === "NavigationStart")?.value ||
        Math.min(...all.map((request) => request.start));
      const ms = (timestamp: number) => (timestamp - navigationStart) * 1000;
      for (const [id, request] of requests) request.sentStatus = sentStatuses.get(id);
      const origin = new URL(site.url).origin;
      return all.map((request): RequestRecord => {
        const parsed = new URL(request.url);
        const sameOrigin = parsed.origin === origin;
        const { pathname } = parsed;
        const source: Source = request.fromMemoryCache
          ? "memory-cache"
          : request.fromDiskCache
            ? "disk-cache"
            : request.sentStatus === 304
              ? "revalidated"
              : "network";
        if (request.failed) errors.push(`requestfailed: ${request.url} ${request.failed}`);
        else if ((request.status ?? 0) >= 400) errors.push(`${request.status}: ${request.url}`);
        const file = decodeURIComponent(
          pathname.endsWith("/") ? `${pathname}index.html` : pathname,
        ).slice(1);
        return {
          // With its query: Next's development code gives the URL of a
          // stylesheet the time of the request, so the cache never has it.
          path: sameOrigin ? `${pathname}${parsed.search}` : request.url,
          kind: sameOrigin ? kindOf(pathname) : "other",
          status: request.sentStatus ?? request.status ?? 0,
          source,
          transferBytes: request.transferBytes,
          resourceBytes: (sameOrigin && sizeOf(file)) || 0,
          startMs: ms(request.start),
          endMs: request.end === undefined ? undefined : ms(request.end),
        };
      });
    },
  };
}

/** The machine a run measures on, for its results. */
export function machine(browser: Browser): Record<string, string | number> {
  const cpus = os.cpus();
  return {
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpu: cpus[0]?.model ?? "unknown",
    cores: cpus.length,
    memoryGb: Math.round(os.totalmem() / 1024 ** 3),
    node: process.version,
    chromium: browser.version(),
  };
}
