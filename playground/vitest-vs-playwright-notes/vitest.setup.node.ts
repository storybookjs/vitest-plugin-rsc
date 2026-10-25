// What a run in a DOM of Node.js has besides vitest.setup.ts, where Browser
// Mode has them of Vitest's own: `expect.element()` and the matchers of the
// DOM, like `toBeInTheDocument()`.
import "@testing-library/jest-dom/vitest";
import "dom-locators/expect-element";
