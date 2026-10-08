// Next marks a test with `// @gate <condition>` or `// @force-gate
// <condition>` when it only holds for some runs: a mode, a bundler, a flag of
// `next.config` (test/lib/gate/README.md in Next's repository). Next's own
// transform rewrites the pragma into a call of `_test_gate`; this is that
// function, for the conditions as they are in this run.
import { describe, it } from "vitest";
import { gateConfig, mode } from "virtual:next-conformance/config";
import { evaluateGate } from "./gate-expression.ts";

type Pragma = { force: boolean; source: string };
type Callee = ((...args: never[]) => unknown) & { skip: (...args: never[]) => unknown };

const conditions: Record<string, unknown> = {
  mode,
  dev: mode === "dev",
  start: mode === "start",
  deploy: false,
  prod: mode !== "dev",
  prefetching: mode !== "dev",
  // No bundler of Next's built the app. A test that asks means Turbopack or not.
  bundler: "webpack",
  turbopack: false,
  rspack: false,
  webpack: true,
  react18: false,
  wasm: false,
  linux: /Linux/.test(navigator.platform),
  macos: /Mac/.test(navigator.platform),
  windows: /Win/.test(navigator.platform),
  ci: false,
  adapter: false,
  nodeMiddleware: false,
  standaloneOutput: false,
  turbopackDev: false,
  turbopackBuild: false,
  FIXME: false,
  TODO: false,
  // The ones Next reads off the resolved `next.config` of the fixture.
  ...gateConfig,
};

const holds = ({ source }: Pragma) => Boolean(evaluateGate(source, conditions));

// A test of Jest is `(name, fn, timeout)`. Vitest takes its options before
// the function.
function withOptions(rest: unknown[], options: Record<string, unknown>): unknown[] {
  const [first, second] = rest;
  if (typeof first === "object" && first !== null) return [{ ...first, ...options }, second];
  return [{ ...options, ...(typeof second === "number" && { timeout: second }) }, first];
}

// A `@force-gate` that does not hold skips the test, or every test of the
// `describe`. A `@gate` that does not hold still runs it: Next expects it to
// fail, and fails it when it passes. That is Vitest's `fails`, which the tests
// of a `describe` inherit, and which src/reporter.ts reads to report such a
// test as skipped by the test itself, not as a pass.
function gated(pragmas: Pragma[], callee: Callee) {
  const skip = pragmas.some((pragma) => pragma.force && !holds(pragma));
  const fails = pragmas.some((pragma) => !pragma.force && !holds(pragma));
  return (name: string, ...rest: unknown[]) => {
    if (skip) return callee.skip(name as never, ...(rest as never[]));
    if (!fails) return callee(name as never, ...(rest as never[]));
    return callee(name as never, ...(withOptions(rest, { fails: true }) as never[]));
  };
}

const only = (callee: typeof it | typeof describe): Callee =>
  Object.assign((...args: never[]) => (callee.only as Callee)(...args), {
    skip: callee.skip as Callee,
  });

const callees: Record<string, Callee> = {
  it,
  test: it,
  fit: only(it),
  "it.only": only(it),
  "test.only": only(it),
  describe,
  "describe.only": only(describe),
};

export function installGate(): void {
  Object.assign(globalThis, {
    _test_gate(pragmas: Pragma[], kind: string) {
      const callee = callees[kind];
      if (!callee) throw new Error(`A @gate pragma on ${kind}(), which this runner does not know.`);
      return gated(pragmas, callee);
    },
    _test_gate_describe_each(pragmas: Pragma[], ...table: unknown[]) {
      type Each = { each(...table: unknown[]): Callee };
      const each = (describe as unknown as Each).each(...table);
      const skip = (describe.skip as unknown as Each).each(...table);
      return gated(pragmas, Object.assign(each, { skip }));
    },
  });
}
