// dom-locators: Vitest browser mode's `page` and its locators, with their
// waiting and their actions, answered inside the document under test: no
// selector engine of the provider, no round trip to it, no Testing Library.
// A test of `vitest/browser` changes its import of `page` and nothing else.

export { configure, type DomLocatorsOptions } from "./environment.ts";
export { UnsupportedError } from "./errors.ts";
export type { ActionOptions } from "./actionability.ts";
export type { Key } from "./keyboard.ts";
export {
  DomLocator,
  type FilterOptions,
  type FindOptions,
  type SerializedLocator,
} from "./locator.ts";
export { page, type DomPage } from "./page.ts";
export type { ByRoleOptions, TextOptions } from "./selectors.ts";
