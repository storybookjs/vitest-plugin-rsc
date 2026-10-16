// Helpers of the tests that work on the page. `whereAmI` has to see the
// browser it runs in. This is not a test file or a setup file, so
// `browserModules` in vitest.config.ts says so. Without that it is server
// code, like every other module here, and `typeof window` is "undefined".

// The rules of the stylesheets in the document. A browser does not let a
// script read those of a stylesheet of another origin.
export function cssRules(): CSSRule[] {
  return [...document.styleSheets].flatMap((sheet) => {
    try {
      return [...sheet.cssRules];
    } catch {
      return [];
    }
  });
}

export function whereAmI(): string {
  return typeof window === "undefined" ? "server" : "browser";
}

// The URLs of the stylesheets that are linked in the document.
export function linkedStylesheets(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
    (link) => link.href,
  );
}

// The containers in the body that vitest-browser-react rendered in, and has
// not taken away: it gives each an id of Vitest, for its locators.
export function renderedContainers(): Element[] {
  return Array.from(document.querySelectorAll('body > [data-testid^="__vitest_"]'));
}
