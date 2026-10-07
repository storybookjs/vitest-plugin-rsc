// Stands in for `NextInstance` of `test/lib/next-modes/base.ts`: the app that
// a test of Next starts with `nextTestSetup()`. Next copies the fixture to a
// temporary directory, installs it, builds it and starts a server. Here the
// runner has copied the fixture, and the plugin serves it in the tab.
import * as cheerio from "cheerio";
import { handleRequest } from "vitest-plugin-rsc/nextjs/testing-library";
import { commands } from "vitest/browser";
import { root } from "virtual:next-conformance/config";
import { openBrowser, type Browser, type BrowserOptions } from "./browser.ts";
import { consoleCapture } from "./console.ts";
import { Readable } from "./stream.ts";
import { unsupported } from "./unsupported.ts";

declare module "vitest/browser" {
  interface BrowserCommands {
    conformanceReadFile(file: string): Promise<string | null>;
    conformanceServerNetwork(): Promise<void>;
  }
}

type Query = Record<string, unknown> | string | null | undefined;

function withQuery(pathname: string, query: Query): string {
  if (!query) return pathname;
  const search =
    typeof query === "string"
      ? query
      : new URLSearchParams(
          Object.entries(query).flatMap(([key, value]) =>
            Array.isArray(value)
              ? value.map((item) => [key, String(item)])
              : [[key, String(value)]],
          ),
        ).toString();
  if (search.length === 0) return pathname;
  return search.startsWith("?") || pathname.endsWith("?")
    ? `${pathname}${search}`
    : `${pathname}?${search}`;
}

// What only a build or a deployment has.
const buildOutput = /^\.next(\/|$)/;

export class NextInstance {
  private outputStart = consoleCapture.output.length;
  private stopListening = new Map<unknown, () => void>();
  private readonly unavailable: string | undefined;

  /** With why `nextTestSetup()` could not give the test the app it asks for, if so. */
  constructor(unavailable?: string) {
    this.unavailable = unavailable;
  }

  private available(): void {
    if (this.unavailable) unsupported(this.unavailable);
  }

  get url(): string {
    return window.location.origin;
  }
  get appPort(): string {
    return window.location.port;
  }
  get testDir(): string {
    return root;
  }
  get distDir(): string {
    return ".next";
  }
  get buildId(): string {
    return unsupported("the build id: there is no build");
  }
  get deploymentId(): undefined {
    return undefined;
  }
  get supportsImmutableAssets(): boolean {
    return false;
  }
  get assetToken(): undefined {
    return undefined;
  }
  getDeploymentIdQuery(): string {
    return "";
  }
  getAssetQuery(): string {
    return "";
  }

  // The server's output is the tab's console: see console.ts.
  get cliOutput(): string {
    return consoleCapture.output.slice(this.outputStart);
  }
  getCliOutputFromHere(): () => string {
    const length = this.cliOutput.length;
    return () => this.cliOutput.slice(length);
  }
  on(event: string, listener: (chunk: string) => void): void {
    if (event !== "stdout" && event !== "stderr") unsupported(`next.on("${event}")`);
    this.stopListening.set(
      listener,
      consoleCapture.listen((chunk, source) => {
        if ((source === "error" || source === "warning") === (event === "stderr")) listener(chunk);
      }),
    );
  }
  off(_event: string, listener: (chunk: string) => void): void {
    this.stopListening.get(listener)?.();
    this.stopListening.delete(listener);
  }

  async fetch(pathname: string, init?: RequestInit): Promise<Response> {
    this.available();
    // A stream of Node.js as the body: see stream.ts.
    const body = init?.body as unknown;
    if (body instanceof Readable)
      init = { ...init, body: body.toWeb(), duplex: "half" } as RequestInit;
    const url = new URL(pathname, this.url);
    // What a deployment serves next to its routes, the dev server serves
    // here: the files of fonts and images, and Next's image optimizer.
    // `handleRequest()` only reaches the routes of the app.
    if (url.pathname.startsWith("/_next/")) return fetch(url, init);
    return handleRequest(url, init);
  }
  async render(pathname: string, query?: Query, init?: RequestInit): Promise<string> {
    const response = await this.fetch(withQuery(pathname, query), init);
    return response.text();
  }
  async render$(
    pathname: string,
    query?: Query,
    init?: RequestInit,
  ): Promise<ReturnType<typeof cheerio.load>> {
    return cheerio.load(await this.render(pathname, query, init));
  }
  async browser(url: string, options?: BrowserOptions): Promise<Browser> {
    this.available();
    return openBrowser(new URL(url, this.url).href, options);
  }
  async browserWithResponse(): Promise<never> {
    return unsupported("next.browserWithResponse(): Playwright's response of the document");
  }

  // The files of the app, as they are. The plugin loads them when the run
  // starts and when a route is first asked for: a change to one is not a new
  // build, and there is no dev server to pick it up.
  async readFile(file: string): Promise<string> {
    if (buildOutput.test(file)) unsupported(`the build output: ${file}`);
    const content = await commands.conformanceReadFile(file);
    if (content === null) throw new Error(`ENOENT: no such file or directory, open '${file}'`);
    return content;
  }
  readFileSync(file: string): never {
    return unsupported(`next.readFileSync("${file}"): the test runs in a tab`);
  }
  async readJSON(file: string): Promise<unknown> {
    return JSON.parse(await this.readFile(file));
  }
  async hasFile(file: string): Promise<boolean> {
    if (buildOutput.test(file)) unsupported(`the build output: ${file}`);
    return (await commands.conformanceReadFile(file)) !== null;
  }
  getPrerenderFilePath(): never {
    return unsupported("a prerendered file: nothing is prerendered");
  }
  async waitForMinPrerenderAge(): Promise<void> {}

  private changesTheApp(what: string): never {
    return unsupported(
      `${what}: a change to the files of the app needs a new build, or a dev server`,
    );
  }
  patchFile = async () => this.changesTheApp("next.patchFile()");
  deleteFile = async () => this.changesTheApp("next.deleteFile()");
  renameFile = async () => this.changesTheApp("next.renameFile()");
  renameFolder = async () => this.changesTheApp("next.renameFolder()");
  remove = async () => this.changesTheApp("next.remove()");
  symlink = async () => this.changesTheApp("next.symlink()");
  writeFileBuffer = async () => this.changesTheApp("next.writeFileBuffer()");

  private runsNext(what: string): never {
    return unsupported(`${what}: the test runs the Next.js CLI itself`);
  }
  build = async () => this.runsNext("next.build()");
  start = async () => this.runsNext("next.start()");
  stop = async () => this.runsNext("next.stop()");
  clean = async () => this.runsNext("next.clean()");
  runCommand = async () => this.runsNext("next.runCommand()");
  getResolvedConfig = async () => this.runsNext("next.getResolvedConfig()");
  async destroy(): Promise<void> {
    for (const stop of this.stopListening.values()) stop();
    this.stopListening.clear();
  }
}
