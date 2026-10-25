// dom-locators: Vitest browser mode's `page` and its locators, with their
// waiting and their actions, answered inside the document under test: no
// selector engine of the provider, no round trip to it, no Testing Library.
// A test of `vitest/browser` changes its import of `page` and nothing else.

export { configure, type DomLocatorsOptions } from "./environment.ts";
export { UnsupportedError } from "./errors.ts";
export type { ActionOptions } from "./actionability.ts";
export type { Key } from "./keyboard.ts";
export type { Modifier } from "./modifiers.ts";
export type { MouseButton, Position } from "./pointer.ts";
export {
  DomLocator,
  // Vitest's name, so that a test's `import { page, type Locator }` changes its module alone.
  type DomLocator as Locator,
  type ClickOptions,
  type DoubleClickOptions,
  type FillOptions,
  type FilterOptions,
  type FindOptions,
  type HoverOptions,
  type PressOptions,
  type UploadOptions,
  type WheelOptions,
  type SerializedLocator,
} from "./locator.ts";
export { page, type DomPage } from "./page.ts";
export type { ByRoleOptions, TextOptions } from "./selectors.ts";
