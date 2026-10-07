// Next marks a test with `// @gate <condition>` or `// @force-gate
// <condition>` when it only holds for some runs: a mode, a bundler, a flag of
// `next.config` (test/lib/gate/README.md in Next's repository). Next's own
// transform rewrites the pragma into a call of `_test_gate`; this is that
// function, for the conditions as they are in this run.
import { describe, it } from "vitest";
import { gateConfig, mode } from "virtual:next-conformance/config";
import { evaluateGate } from "./gate-expression.ts";

type Pragma = { force: boolean; source: string };
type Body = (...args: never[]) => unknown;

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

// The gates of the `describe` blocks that are being collected.
const enclosing: Pragma[] = [];

// A test under a `@gate` that does not hold is expected to fail, and Next
// fails it when it passes. Here it is reported as skipped, with the pragma.
function expectFailure(pragma: Pragma, body: Body | undefined): Body | undefined {
  if (!body) return body;
  return (async (context: { skip(note: string): never }, ...rest: never[]) => {
    try {
      await (body as (...args: unknown[]) => unknown)(context, ...rest);
    } catch {
      context.skip(`@gate ${pragma.source}: fails, as Next expects of this run`);
    }
    throw new Error(
      `Gated test passed unexpectedly: \`// @gate ${pragma.source}\` does not hold for this run.`,
    );
  }) as Body;
}

function gated(pragmas: Pragma[], callee: (...args: never[]) => unknown, isSuite: boolean) {
  const skip = pragmas.find((pragma) => pragma.force && !holds(pragma));
  const failing = pragmas.find((pragma) => !pragma.force && !holds(pragma));
  return (name: string, ...rest: unknown[]) => {
    if (skip)
      return (callee as unknown as { skip: Body }).skip(name as never, ...(rest as never[]));
    if (!failing) return callee(name as never, ...(rest as never[]));
    const index = rest.findIndex((argument) => typeof argument === "function");
    const body = rest[index] as Body;
    if (isSuite) {
      rest[index] = () => {
        enclosing.push(failing);
        try {
          return (body as () => unknown)();
        } finally {
          enclosing.pop();
        }
      };
    } else {
      rest[index] = expectFailure(failing, body);
    }
    return callee(name as never, ...(rest as never[]));
  };
}

const callees: Record<string, (...args: never[]) => unknown> = {
  it,
  test: it,
  fit: it.only,
  "it.only": it.only,
  "test.only": it.only,
  describe,
  "describe.only": describe.only,
};

export function installGate(): void {
  // A test inside a gated `describe` is not rewritten itself.
  const inSuite = (callee: typeof it) =>
    new Proxy(callee, {
      apply(target, self, args: unknown[]) {
        const failing = enclosing.at(-1);
        if (failing) {
          const index = args.findIndex((argument) => typeof argument === "function");
          if (index >= 0) args[index] = expectFailure(failing, args[index] as Body);
        }
        return Reflect.apply(target, self, args);
      },
    });
  Object.assign(globalThis, {
    it: inSuite(it),
    test: inSuite(it),
    _test_gate: (pragmas: Pragma[], kind: string) =>
      gated(pragmas, callees[kind]!, kind.startsWith("describe")),
    _test_gate_describe_each:
      (pragmas: Pragma[], ...table: unknown[]) =>
      (name: string, body: Body) => {
        const each = (describe.each as (...table: unknown[]) => (...args: never[]) => unknown)(
          ...table,
        );
        const skip = (describe.skip.each as (...table: unknown[]) => (...args: never[]) => unknown)(
          ...table,
        );
        return gated(pragmas, Object.assign(each, { skip }), true)(name, body);
      },
  });
}
