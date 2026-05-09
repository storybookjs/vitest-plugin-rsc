type RunPhase = "render" | "action";

type MaybePromise<T> = T | Promise<T>;

export type NextRequestContext = {
  run<T>(phase: RunPhase, callback: () => MaybePromise<T>): MaybePromise<T>;
  completeAction(): void;
};

export type NextRequestContextOptions = {
  url?: string;
  headers?: Headers | Record<string, string>;
};

export async function createNextRequestContext({
  url = "/",
  headers = {},
}: NextRequestContextOptions = {}): Promise<NextRequestContext> {
  const [
    { actionAsyncStorage },
    { workAsyncStorage },
    { workUnitAsyncStorage },
    edgeCookiesModule,
    requestCookiesModule,
    headersModule,
  ] = await Promise.all([
    import("next/dist/server/app-render/action-async-storage.external.js"),
    import("next/dist/server/app-render/work-async-storage.external.js"),
    import("next/dist/server/app-render/work-unit-async-storage.external.js"),
    import("next/dist/compiled/@edge-runtime/cookies/index.js"),
    import("next/dist/server/web/spec-extension/adapters/request-cookies.js"),
    import("next/dist/server/web/spec-extension/adapters/headers.js"),
  ]);

  const location = new URL(url, "http://localhost");
  const requestHeaders =
    headers instanceof Headers ? headers : new Headers(Object.entries(headers));
  const responseHeaders = new Headers();
  const workStore = {
    isStaticGeneration: false,
    page: `${location.pathname === "/" ? "/index" : location.pathname}/page`,
    route: location.pathname,
    incrementalCache: { revalidateTag: async () => {} },
    afterContext: {},
    previouslyRevalidatedTags: [],
    refreshTagsByCacheKind: new Map(),
    shouldTrackFetchMetrics: false,
    runInCleanSnapshot: <T>(fn: () => T) => fn(),
    reactServerErrorsByDigest: new Map(),
    cacheComponentsEnabled: false,
    validationLevel: "standard",
    buildId: "vitest-plugin-rsc",
    deploymentId: "vitest-plugin-rsc",
  };

  const cache: {
    headers?: Headers;
    cookies?: unknown;
    mutableCookies?: unknown;
    userspaceMutableCookies?: unknown;
  } = {};

  const requestStore = {
    type: "request",
    phase: "render",
    implicitTags: { tags: [], expirationsByCacheKind: new Map() },
    url: {
      pathname: location.pathname,
      search: location.search,
    },
    rootParams: {},
    get headers() {
      cache.headers ??= headersModule.HeadersAdapter.seal(
        headersModule.HeadersAdapter.from(requestHeaders),
      );
      return cache.headers;
    },
    get cookies() {
      cache.cookies ??= requestCookiesModule.RequestCookiesAdapter.seal(
        new edgeCookiesModule.RequestCookies(requestHeaders),
      );
      return cache.cookies;
    },
    set cookies(value: unknown) {
      cache.cookies = value;
    },
    get mutableCookies() {
      cache.mutableCookies ??= requestCookiesModule.MutableRequestCookiesAdapter.wrap(
        new edgeCookiesModule.RequestCookies(requestHeaders),
        (cookies: string[]) => {
          responseHeaders.delete("Set-Cookie");
          for (const cookie of cookies) {
            responseHeaders.append("Set-Cookie", cookie);
          }
        },
      );
      return cache.mutableCookies;
    },
    get userspaceMutableCookies() {
      cache.userspaceMutableCookies ??= requestCookiesModule.createCookiesWithMutableAccessCheck(
        requestStore as never,
      );
      return cache.userspaceMutableCookies;
    },
    draftMode: {
      isEnabled: false,
      enable() {},
      disable() {},
    },
    renderResumeDataCache: null,
    isHmrRefresh: false,
    serverComponentsHmrCache: undefined,
    fallbackParams: null,
  };

  return {
    run(phase, callback) {
      requestStore.phase = phase;
      workAsyncStorage.enterWith(workStore as never);
      actionAsyncStorage.enterWith({ isAction: phase === "action" });
      workUnitAsyncStorage.enterWith(requestStore as never);
      return callback();
    },
    completeAction() {
      requestStore.phase = "render";
      actionAsyncStorage.enterWith({ isAction: false });
      requestStore.cookies = requestCookiesModule.RequestCookiesAdapter.seal(
        requestCookiesModule.responseCookiesToRequestCookies(requestStore.mutableCookies as never),
      );
    },
  };
}
