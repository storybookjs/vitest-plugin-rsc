import "@testing-library/jest-dom/vitest";
import "dom-locators/expect-element";

declare module "vitest" {
  interface ProvidedContext {
    /** Where the page and the server run: a worker of Node.js, or, without it, a browser. */
    host?: "node";
  }
}
