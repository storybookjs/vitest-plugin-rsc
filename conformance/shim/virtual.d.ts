declare module "virtual:next-conformance/config" {
  /** The directory of the app under test: a copy of the fixture. */
  export const root: string;
  /** What `NEXT_TEST_MODE` is for Next's own runs. */
  export const mode: "start" | "dev";
  /** The npm packages a fixture can import. */
  export const packages: string[];
  /** Options of `nextTestSetup()` that the runner has applied to the copy of the fixture. */
  export const prepared: string[];
  /** What a `@gate` pragma can ask of the resolved `next.config` of the fixture. */
  export const gateConfig: Record<string, unknown>;
}
