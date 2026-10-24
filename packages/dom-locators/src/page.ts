// `page`: Vitest's `page` of browser mode for the document the test runs in,
// with its `getBy*` from the document's root element, `elementLocator()` and
// `extend()`; what only the provider can do throws.

import { exactByDefault, testIdAttribute } from "./environment.ts";
import { deferred } from "./errors.ts";
import { DomLocator, elementLocator, locatorOf } from "./locator.ts";
import {
  byAltText,
  byLabelText,
  byPlaceholder,
  byRole,
  byTestId,
  byText,
  byTitle,
  type ByRoleOptions,
  type TextOptions,
} from "./selectors.ts";

/** Vitest's `BrowserPage`, answered in the page. */
export interface DomPage {
  getByRole(role: string, options?: ByRoleOptions): DomLocator;
  getByText(text: string | RegExp, options?: TextOptions): DomLocator;
  getByLabelText(text: string | RegExp, options?: TextOptions): DomLocator;
  getByPlaceholder(text: string | RegExp, options?: TextOptions): DomLocator;
  getByAltText(text: string | RegExp, options?: TextOptions): DomLocator;
  getByTitle(text: string | RegExp, options?: TextOptions): DomLocator;
  getByTestId(testId: string | RegExp): DomLocator;
  /** A locator of `element`, and of the `getBy*` in it: a `renderServer()` container, a story's `canvasElement`. */
  elementLocator(element: Element): DomLocator;
  /** Adds methods to `page`, as Vitest's `page.extend()`. */
  extend(methods: Partial<DomPage>): DomPage;
  viewport(width: number, height: number): Promise<void>;
  screenshot(options?: unknown): Promise<never>;
  mark(name: string, options?: unknown): Promise<void>;
  frameLocator(locator: DomLocator): never;
}

export const page: DomPage = {
  getByRole: (role, options) => locatorOf(byRole(role, options, exactByDefault())),
  getByText: (text, options) => locatorOf(byText(text, options, exactByDefault())),
  getByLabelText: (text, options) => locatorOf(byLabelText(text, options, exactByDefault())),
  getByPlaceholder: (text, options) => locatorOf(byPlaceholder(text, options, exactByDefault())),
  getByAltText: (text, options) => locatorOf(byAltText(text, options, exactByDefault())),
  getByTitle: (text, options) => locatorOf(byTitle(text, options, exactByDefault())),
  getByTestId: (testId) => locatorOf(byTestId(testIdAttribute(), testId)),
  elementLocator,
  extend(methods) {
    return Object.assign(page, methods);
  },
  viewport: () => deferred("page.viewport()"),
  screenshot: () => deferred("page.screenshot()"),
  mark: () => deferred("page.mark()"),
  frameLocator: () => deferred("page.frameLocator()"),
};
