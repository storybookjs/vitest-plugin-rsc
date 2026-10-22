/**
 * The name of the scope that a module runner of the browser layer passes to
 * every module it evaluates, next to Vite's own context
 * (`evaluatorIn()` in utils.ts). With Next.js, its files reach the
 * browser's timers, ports, observers and listeners through it: see
 * nextjs/page-scope.ts. coverage.ts writes the same parameters, to map what
 * V8 covers.
 */
export const pageScopeKey = "__vitest_rsc_page_scope__";

/** A timer of the browser's, as the DOM has it (not Node.js). */
export type SetTimer = (handler: TimerHandler, timeout?: number, ...args: unknown[]) => number;
export type ClearTimer = (id: number | undefined) => void;
export type RequestFrame = (callback: FrameRequestCallback) => number;
export type RequestIdle = (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
export type Cancel = (id: number) => void;

/** What the files of Next.js get in place of the browser's globals. */
export type Scope = {
  readonly setTimeout: SetTimer | undefined;
  readonly clearTimeout: ClearTimer | undefined;
  readonly setInterval: SetTimer | undefined;
  readonly clearInterval: ClearTimer | undefined;
  readonly requestAnimationFrame: RequestFrame | undefined;
  readonly cancelAnimationFrame: Cancel | undefined;
  readonly requestIdleCallback: RequestIdle | undefined;
  readonly cancelIdleCallback: Cancel | undefined;
  readonly MessageChannel: typeof MessageChannel | undefined;
  readonly PerformanceObserver: typeof PerformanceObserver | undefined;
  /** `addEventListener()` of `window`, also as a global. */
  readonly windowAddEventListener: EventTarget["addEventListener"];
  readonly windowRemoveEventListener: EventTarget["removeEventListener"];
  readonly documentAddEventListener: EventTarget["addEventListener"];
  readonly documentRemoveEventListener: EventTarget["removeEventListener"];
};

/**
 * A global of the browser's as it is when it is called, not when the scope
 * was made: a test may fake the timers. Undefined where the browser has
 * none, as `typeof` would find it.
 */
export function global<Type>(name: string): Type | undefined {
  return (globalThis as Record<string, unknown>)[name] as Type | undefined;
}

// Calls the global of that name, with the arguments it gets.
const call =
  <Type extends (...args: never[]) => unknown>(name: string) =>
  (...args: Parameters<Type>) =>
    (global(name) as (...args: Parameters<Type>) => ReturnType<Type>)(...args);

const ifThere = <Type extends (...args: never[]) => unknown>(name: string) =>
  global(name) ? (call<Type>(name) as unknown as Type) : undefined;

/** The browser's own, for a runner outside a page. */
export const hostScope: Scope = {
  get setTimeout() {
    return ifThere<SetTimer>("setTimeout");
  },
  get clearTimeout() {
    return ifThere<ClearTimer>("clearTimeout");
  },
  get setInterval() {
    return ifThere<SetTimer>("setInterval");
  },
  get clearInterval() {
    return ifThere<ClearTimer>("clearInterval");
  },
  get requestAnimationFrame() {
    return ifThere<RequestFrame>("requestAnimationFrame");
  },
  get cancelAnimationFrame() {
    return ifThere<Cancel>("cancelAnimationFrame");
  },
  get requestIdleCallback() {
    return ifThere<RequestIdle>("requestIdleCallback");
  },
  get cancelIdleCallback() {
    return ifThere<Cancel>("cancelIdleCallback");
  },
  get MessageChannel() {
    return global<typeof MessageChannel>("MessageChannel");
  },
  get PerformanceObserver() {
    return global<typeof PerformanceObserver>("PerformanceObserver");
  },
  // The method that the target has when it is called: on `window` that is
  // Vitest's, which counts the listeners of `error`.
  windowAddEventListener: (...args) => (window as EventTarget).addEventListener(...args),
  windowRemoveEventListener: (...args) => (window as EventTarget).removeEventListener(...args),
  documentAddEventListener: (...args) => (document as EventTarget).addEventListener(...args),
  documentRemoveEventListener: (...args) => (document as EventTarget).removeEventListener(...args),
};
