// Stands in for Jest's `expect` package, which a test of Next imports for
// what it also has as a global: Vitest's, with the matchers of setup.ts.
import { expect } from "vitest";

export { expect };
export default expect;
