import { normalizePath, parseAstAsync, type Plugin } from "vite";
import { lookupEnvironment, lookupServers } from "../related-lookup.ts";
import { walk, type Node } from "./commonjs.ts";
import type { NextProject, NextRoute } from "./project.ts";

// The routes a test opens, on the map of Vitest's lookup: see
// ../related-lookup.ts. A test that calls `renderServer({ url })` does not
// import the files of the route, so `vitest --changed` and `vitest related`
// would find it for no change of the app. In the lookup's environment alone,
// a module that calls `renderServer()` or `handleRequest()` gets an import of
// the files of each route it opens: the page, its layouts and boundaries, and
// the middleware. The imports are in a function that is never called, so
// nothing runs them. Vitest follows them as it follows any import, and so on
// to what those files import.
//
// The URL is read off the code. A string is a URL as the server in front of
// the app answers it, through the redirects and rewrites of `next.config`, and
// as the app's routes alone answer it, for a rule that the test's headers or
// cookies turn off. A template literal is each route whose pathname it can be:
// `/notes/${id}` is `/notes/new` and `/notes/[id]`. Anything else, a call that
// is not read, or a URL of no route in an app with a middleware, which can
// send it anywhere, is every route. What is not read: where the middleware
// sends a URL of a route, and where a test navigates after that. The map only
// has more than Vitest's own: no test file is found for fewer changes.

/** A request the code makes: its URL, a placeholder for each expression of a template. */
export type RouteRequest = {
  url: string;
  /** Whether it renders the route's files, which the node of a test does not. */
  route: boolean;
  /** Whether the middleware gets it. */
  proxy: boolean;
};

/** What a placeholder of a template literal stands for in `RouteRequest.url`. */
export const placeholder = "\0";

const opening = ["renderServer", "handleRequest"];

/**
 * The requests that the calls of `renderServer()` and `handleRequest()` of
 * `specifier` make in `code`, a module of JavaScript. `"every"` where a call
 * or its URL is not read off the code. Nothing for code that calls neither.
 */
export async function requestsOf(
  code: string,
  specifier: string,
): Promise<RouteRequest[] | "every"> {
  const ast = (await parseAstAsync(code)) as unknown as Node & { body: Node[] };
  // The local names of the functions, and of a namespace that has them.
  const functions = new Map<string, string>();
  const namespaces = new Set<string>();
  for (const statement of ast.body) {
    const source = (statement.source as { value: unknown } | null | undefined)?.value;
    if (source !== specifier) continue;
    // A module that passes them on, for the modules that import it.
    if (statement.type === "ExportNamedDeclaration" || statement.type === "ExportAllDeclaration") {
      return "every";
    }
    if (statement.type !== "ImportDeclaration") continue;
    for (const imported of statement.specifiers as Node[]) {
      const local = (imported.local as { name: string }).name;
      if (imported.type === "ImportNamespaceSpecifier") namespaces.add(local);
      if (imported.type !== "ImportSpecifier") continue;
      const { name, value } = imported.imported as { name?: string; value?: string };
      const importedName = name ?? value;
      if (importedName && opening.includes(importedName)) functions.set(local, importedName);
    }
  }
  // `await import()` of the testing library, which is not read.
  for (const [node] of walk(ast)) {
    const source = node.type === "ImportExpression" && (node.source as Node);
    if (source && source.type === "Literal" && source.value === specifier) return "every";
  }
  if (functions.size === 0 && namespaces.size === 0) return [];

  const requests: RouteRequest[] = [];
  for (const [node, parent] of walk(ast)) {
    if (node.type !== "Identifier" || !parent) continue;
    const name = node.name as string;
    // Not the key of a property, as in `a.renderServer` or `{ renderServer: 1 }`,
    // nor the import itself.
    const isKey =
      (parent.type === "MemberExpression" && parent.property === node && !parent.computed) ||
      (parent.type === "Property" && parent.key === node && !parent.computed && !parent.shorthand);
    if (isKey || parent.type === "ImportSpecifier" || parent.type === "ImportNamespaceSpecifier") {
      continue;
    }
    let callee: Node = node;
    let opened = functions.get(name);
    if (namespaces.has(name)) {
      // `testing.cleanup()` opens nothing; `testing` passed on may.
      if (parent.type !== "MemberExpression" || parent.object !== node || parent.computed) {
        return "every";
      }
      opened = (parent.property as { name: string }).name;
      if (!opening.includes(opened)) continue;
      callee = parent;
    }
    if (!opened) continue;
    const call = callee === node ? parent : parentOf(ast, callee);
    if (call?.type !== "CallExpression" || call.callee !== callee) return "every";
    const request = requestOf(opened, call.arguments as Node[]);
    if (!request) return "every";
    requests.push(...request);
  }
  return requests;
}

// What one call requests: nothing for a node without the app's layouts.
// Nothing at all where the call is not read.
function requestOf(name: string, args: Node[]): RouteRequest[] | undefined {
  const [first, second] = args;
  if (name === "handleRequest") {
    const url = first && urlOf(first);
    return url === undefined ? undefined : [{ url, route: true, proxy: true }];
  }
  // `renderServer({ url })`: a route, with the server in front of it.
  if (first === undefined || first.type === "ObjectExpression") {
    const options = first && optionsOf(first);
    if (first && !options) return;
    const url = options?.url ? urlOf(options.url) : "/";
    if (url === undefined) return;
    return [{ url, route: true, proxy: options?.proxy === undefined || isOn(options.proxy) }];
  }
  // Any other value may be the options: only a JSX element is a node.
  if (!isElement(first)) return;
  // `renderServer(<Node />, { url })`: the route's layouts and server only
  // when the options ask for them.
  if (second === undefined) return [];
  const options = optionsOf(second);
  if (!options) return;
  const url = options.url ? urlOf(options.url) : "/";
  if (url === undefined) return;
  const route = options.layouts !== undefined && isOn(options.layouts);
  const proxy = options.proxy !== undefined && isOn(options.proxy);
  return route || proxy ? [{ url, route, proxy }] : [];
}

// The properties of an object literal, by their name. Nothing for one with a
// spread or a computed key.
function optionsOf(node: Node): Record<string, Node> | undefined {
  if (node.type !== "ObjectExpression") return;
  const options: Record<string, Node> = {};
  for (const property of node.properties as Node[]) {
    if (property.type !== "Property" || property.computed) return;
    const key = property.key as { name?: string; value?: unknown };
    const name = key.name ?? key.value;
    if (typeof name !== "string") return;
    options[name] = property.value as Node;
  }
  return options;
}

// What JSX compiles to: a call of `jsx()`, `jsxs()` or `jsxDEV()` of the
// automatic runtime, under its own name or with an underscore, or of
// `createElement()`.
function isElement(node: Node): boolean {
  if (node.type !== "CallExpression") return false;
  const callee = node.callee as Node;
  const name =
    callee.type === "Identifier"
      ? (callee.name as string)
      : callee.type === "MemberExpression" && !callee.computed
        ? ((callee.property as { name: string }).name as string)
        : undefined;
  return name !== undefined && /^(?:_?jsxs?|_?jsxDEV|createElement)$/.test(name);
}

// `false` and `undefined` are off; any other value may be on.
const isOn = (node: Node) =>
  !(node.type === "Literal" && node.value === false) &&
  !(node.type === "Identifier" && node.name === "undefined");

// A string, or a template literal with a placeholder for each expression.
function urlOf(node: Node): string | undefined {
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type !== "TemplateLiteral") return;
  const quasis = node.quasis as { value: { cooked: string | null } }[];
  if (quasis.some(({ value }) => value.cooked === null)) return;
  return quasis.map(({ value }) => value.cooked).join(placeholder);
}

function parentOf(ast: Node, child: Node): Node | undefined {
  for (const [node, parent] of walk(ast)) if (node === child) return parent;
}

/** The routes a request can get, by its URL: every route where that is not known. */
export async function routesOf(
  project: Pick<NextProject, "routes" | "routing" | "pageOf" | "middlewareFile">,
  { url, proxy }: Pick<RouteRequest, "url" | "proxy">,
): Promise<NextRoute[]> {
  const { routes, routing } = project;
  // Through the server in front of the app, and past it, for a rule of
  // `next.config` that the headers or the cookies of the request decide.
  const pagesOf = async (target: URL) =>
    new Set(
      await Promise.all([
        project.pageOf(target, { proxy: false }),
        ...(proxy ? [project.pageOf(target, { proxy: true })] : []),
      ]),
    );
  // A URL of no route gets the not-found page, unless a middleware can send
  // it to any route.
  const orNotFound = (found: NextRoute[]) =>
    found.length > 0
      ? found
      : proxy && project.middlewareFile
        ? routes
        : routes.filter((route) => route.page === "/_not-found/page");
  if (!url.includes(placeholder)) {
    const pages = await pagesOf(new URL(url, "http://localhost"));
    return orNotFound(routes.filter((route) => pages.has(route.page)));
  }
  // The pathname: without the query and the hash, the origin and the base path.
  let pathname = url.split(/[?#]/)[0]!.replace(/^[a-z][a-z\d+.-]*:\/\/[^/]*/i, "");
  // An expression in front of the first slash, as in `${origin}/notes`, is
  // the origin. One without a slash after it can be any pathname.
  if (pathname.startsWith(placeholder)) {
    const slash = pathname.indexOf("/");
    if (slash === -1) return routes;
    pathname = pathname.slice(slash);
  }
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  // And a URL with a value for each expression, through `next.config`.
  const sample = await pagesOf(
    new URL(pathname.replaceAll(placeholder, "-x-"), "http://localhost"),
  );
  if (routing.basePath && pathname.startsWith(routing.basePath)) {
    pathname = pathname.slice(routing.basePath.length);
  }
  const parts = segmentsOf(pathname);
  const found = routes.filter(
    (route) => sample.has(route.page) || matches(parts, segmentsOf(route.pathname)),
  );
  // An expression can be what makes it a URL of a route.
  return found.length > 0 ? found : routes;
}

const segmentsOf = (pathname: string) => pathname.split("/").filter(Boolean);
const isCatchAll = (segment: string) => /^\[\[?\.\.\./.test(segment);
const isOptional = (segment: string) => segment.startsWith("[[...");
const isDynamic = (segment: string) => segment.startsWith("[");

// Whether a URL with these segments, a placeholder for any text, can be one of
// a route with these. An expression that is a segment of its own is one
// segment, as the `id` of `/notes/${id}` is. One at the end of the last
// segment, after text, as in `/notes${rest}`, can have slashes in it.
function matches(url: string[], route: string[]): boolean {
  const [part, ...restOfUrl] = url;
  const [segment, ...restOfRoute] = route;
  if (part === undefined) return route.every(isOptional);
  if (segment === undefined) return false;
  if (restOfUrl.length === 0 && part !== placeholder && part.endsWith(placeholder)) {
    if (isDynamic(segment)) return true;
    return patternOf(part).test(segment);
  }
  if (isCatchAll(segment)) {
    return (
      matches(restOfUrl, route) ||
      matches(restOfUrl, restOfRoute) ||
      (isOptional(segment) && matches(url, restOfRoute))
    );
  }
  if (isDynamic(segment)) return matches(restOfUrl, restOfRoute);
  return patternOf(part).test(segment) && matches(restOfUrl, restOfRoute);
}

// A part of a URL as a pattern: any text for each placeholder.
const patternOf = (part: string) =>
  new RegExp(
    `^${part
      .split(placeholder)
      .map((text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*")}$`,
  );

export type RouteLookupOptions = {
  getProject: () => NextProject;
  /** What a test imports `renderServer()` and `handleRequest()` from. */
  specifier: string;
};

/** The plugin that adds the routes a module opens to the map of Vitest's lookup. */
export function routeLookupPlugin({ getProject, specifier }: RouteLookupOptions): Plugin {
  const servers = lookupServers();
  // The files of a route, once for a project.
  const filesOf = new WeakMap<NextProject, Map<NextRoute, Promise<string[]>>>();
  const filesOfRoute = (project: NextProject, route: NextRoute) => {
    if (!filesOf.has(project)) filesOf.set(project, new Map());
    const files = filesOf.get(project)!;
    if (!files.has(route)) {
      files.set(
        route,
        // Not Next's own pages: Vitest does not follow a package.
        project
          .loadRouteEntry(route)
          .then(({ watchFiles }) =>
            watchFiles.map(normalizePath).filter((file) => !file.includes("/node_modules/")),
          ),
      );
    }
    return files.get(route)!;
  };
  // The routes the requests open, every route where one is not known.
  const routesOfRequests = async (project: NextProject, requests: RouteRequest[] | "every") => {
    if (requests === "every") return project.routes;
    try {
      const opened = requests.filter(({ route }) => route);
      return (await Promise.all(opened.map((request) => routesOf(project, request)))).flat();
    } catch {
      // A URL that `new URL()` or the routing does not take.
      return project.routes;
    }
  };
  return {
    name: "vitest-plugin-rsc:next-route-lookup",
    // After the plugins that compile TypeScript and JSX.
    enforce: "post",
    configureVitest({ project, defineCacheKeyGenerator }) {
      if (!servers.add(project)) return;
      // Vitest keeps what a module compiles to between runs, by its code. What
      // this adds to it is of the routes of the app as well: a module that
      // can get it is compiled again for every run.
      defineCacheKeyGenerator(({ environment, sourceCode }) =>
        environment.name === lookupEnvironment && sourceCode.includes(specifier)
          ? false
          : undefined,
      );
    },
    async transform(code, id) {
      if (!servers.inLookup(this)) return;
      if (!code.includes(specifier) || id.includes("/node_modules/")) return;
      const requests = await requestsOf(code, specifier);
      if (requests !== "every" && requests.length === 0) return;
      const project = getProject();
      const routes = await routesOfRequests(project, requests);
      const files = new Set(
        (await Promise.all(routes.map((route) => filesOfRoute(project, route)))).flat(),
      );
      const proxy = requests === "every" || requests.some((request) => request.proxy);
      if (project.middlewareFile && proxy) files.add(normalizePath(project.middlewareFile));
      files.delete(normalizePath(id.split("?")[0]!));
      if (files.size === 0) return;
      const imports = [...files].sort().map((file) => `import(${JSON.stringify(file)})`);
      // At the end, so that the lines of the module stay where they are.
      return { code: `${code}\nvoid (() => [${imports.join(", ")}]);\n`, map: null };
    },
  };
}
