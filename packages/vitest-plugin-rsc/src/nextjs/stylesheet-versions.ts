import { graphStylesheetAttribute, stylesheetOfUrl } from "./styles-shared.ts";

// The links of a stylesheet that Next links, moved to the version of now
// after a change of its CSS, as Next's client moves its own links: the page
// stays, with its state. The dev server says which stylesheets changed, with
// the URL of the version of each (`stylesheetsChangedEvent`, styles.ts). Every
// link of such a stylesheet moves, whatever version it has and however its
// path is encoded: React adds a link for every render of a page with
// another URL, and keeps the ones before. The links that the files of the
// host made are the graph's to move, also while a page has parked them
// (client-graph.ts).

/**
 * The URLs of the versions of now, by the stylesheet they are of: see
 * `stylesheetOfUrl()`.
 */
export type StylesheetVersions = Map<string, string>;

export function stylesheetVersions(urls: string[]): StylesheetVersions {
  return new Map(
    urls.flatMap((url) => {
      const stylesheet = stylesheetOfUrl(url);
      return stylesheet === undefined ? [] : [[stylesheet, url] as const];
    }),
  );
}

// The links that a link of a later version takes the place of, once it has
// loaded: these move no further.
const replaced = new WeakSet<HTMLLinkElement>();

/**
 * Moves `link` to `url`: a link of `url` comes next to it, with the same
 * attributes, and `link` goes once that one has loaded or failed, so the
 * document is never without the CSS. A link that has no CSS yet, out of the
 * document or still loading, gets the URL itself: what waits for its `load`
 * gets that of `url`. Returns the link of `url`.
 */
export function moveLink(link: HTMLLinkElement, url: string): HTMLLinkElement {
  if (!link.isConnected || !link.sheet) {
    link.href = url;
    return link;
  }
  const moved = link.cloneNode() as HTMLLinkElement;
  moved.href = url;
  replaced.add(link);
  const remove = () => link.remove();
  moved.addEventListener("load", remove, { once: true });
  moved.addEventListener("error", remove, { once: true });
  link.after(moved);
  return moved;
}

/** Moves the links of the page, not the graph's, to the versions of now. */
export function movePageLinks(versions: StylesheetVersions): void {
  const links = document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]');
  for (const link of links) {
    if (replaced.has(link) || link.hasAttribute(graphStylesheetAttribute)) continue;
    const stylesheet = stylesheetOfUrl(link.href);
    const url = stylesheet === undefined ? undefined : versions.get(stylesheet);
    // Not one of that version already, also with another `?v=` of Next's.
    if (url !== undefined && new URL(url, link.href).pathname !== new URL(link.href).pathname) {
      moveLink(link, url);
    }
  }
}
