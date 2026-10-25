// The `navigate` events of the Navigation API for a DOM that has no
// Navigation API, like happy-dom and jsdom in a worker of Node.js: what
// browser-context.ts and host-document.ts hear of the navigations of the
// document (page-host.ts). Not `window.navigation`, which a library would
// take for the whole API. The DOM loads no other document: this is the
// default action of a link or a form that loads one, which happy-dom and
// jsdom do not take (index.ts tells happy-dom so). A navigation that nothing
// takes keeps the document, as one that the plugin stops does in a browser.
// A change of the hash is the DOM's.
//
// What starts one: a click on a link, the submit of a form, `location`'s
// `assign()`, `replace()`, `reload()` and `href`, and `history`'s
// `pushState()` and `replaceState()`, which stay in the document. Not
// `form.submit()`, which fires no event, nor a traversal of the history.
// Nor `location` in jsdom, whose members are unforgeable, as a browser's:
// there a navigation by `location` is jsdom's, which keeps the document and
// tells nobody.

type NavigationType = "push" | "replace" | "reload";

type Navigation = {
  url: URL;
  navigationType: NavigationType;
  sameDocument?: boolean;
  formData?: FormData | null;
  downloadRequest?: string | null;
  sourceElement?: Element | null;
};

/** An `EventTarget` with the `navigate` events of the document of `window`. */
export function createNavigation(window: Window): EventTarget {
  const navigation = new EventTarget();
  const { location, history } = window;

  // Whether the DOM takes the navigation on, as its own: a change of the
  // hash that no listener stopped.
  function navigate({
    url,
    navigationType,
    sameDocument = false,
    formData = null,
    downloadRequest = null,
    sourceElement = null,
  }: Navigation): boolean {
    const current = new URL(location.href);
    const hashChange =
      !formData &&
      navigationType !== "reload" &&
      url.hash !== "" &&
      url.href.slice(0, -url.hash.length) ===
        current.href.slice(0, current.href.length - current.hash.length);
    const event = Object.assign(new Event("navigate", { cancelable: !sameDocument }), {
      navigationType,
      destination: { url: url.href, sameDocument: sameDocument || hashChange },
      hashChange,
      formData,
      downloadRequest,
      sourceElement,
    });
    return navigation.dispatchEvent(event) && hashChange;
  }

  // After the app's own listeners, as a browser's default action: a link or a
  // form that React or Next's router took is stopped by then.
  window.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element | null)?.closest?.("a[href], area[href]") as
      | HTMLAnchorElement
      | null
      | undefined;
    if (!link || (link.target && link.target !== "_self")) return;
    const url = new URL(link.href, location.href);
    const download = link.hasAttribute("download") ? link.getAttribute("download") : null;
    if (
      !navigate({ url, navigationType: "push", downloadRequest: download, sourceElement: link })
    ) {
      event.preventDefault();
    }
  });

  window.addEventListener("submit", (event) => {
    if (event.defaultPrevented) return;
    const form = event.target as HTMLFormElement;
    const submitter = (event as SubmitEvent).submitter as
      | HTMLButtonElement
      | HTMLInputElement
      | null;
    const method = (submitter?.getAttribute("formmethod") ?? form.method).toLowerCase();
    if (method === "dialog") return;
    const target = submitter?.getAttribute("formtarget") ?? form.target;
    if (target && target !== "_self") return;
    const action = submitter?.getAttribute("formaction") ?? form.getAttribute("action") ?? "";
    const url = new URL(action, location.href);
    const formData = formDataOf(form, submitter);
    const navigation: Navigation = {
      url,
      navigationType: "push",
      sourceElement: submitter ?? form,
    };
    if (method === "post") {
      navigation.formData = formData;
    } else {
      const query = new URLSearchParams();
      for (const [name, value] of formData) {
        query.append(name, typeof value === "string" ? value : value.name);
      }
      url.search = String(query);
    }
    if (!navigate(navigation)) event.preventDefault();
  });

  // `location`: the document stays where nothing takes the navigation, and
  // the DOM changes the hash.
  const at = (url: string | URL) => new URL(String(url), location.href);
  const { assign, replace } = location;
  const href = descriptorOf(location, "href");
  // While the DOM changes the hash itself, which it may do with `href` or
  // `history`: that is the navigation that was heard.
  let domTakes = false;
  const byDom = (change: () => void) => {
    domTakes = true;
    try {
      change();
    } finally {
      domTakes = false;
    }
  };
  const forgeable = Object.getOwnPropertyDescriptor(location, "assign")?.configurable !== false;
  if (forgeable)
    Object.defineProperties(location, {
      assign: {
        configurable: true,
        writable: true,
        value: (url: string | URL) => {
          if (navigate({ url: at(url), navigationType: "push" })) {
            byDom(() => assign.call(location, String(url)));
          }
        },
      },
      replace: {
        configurable: true,
        writable: true,
        value: (url: string | URL) => {
          if (navigate({ url: at(url), navigationType: "replace" }))
            replace.call(location, String(url));
        },
      },
      reload: {
        configurable: true,
        writable: true,
        value: () => void navigate({ url: at(location.href), navigationType: "reload" }),
      },
      href: {
        configurable: true,
        enumerable: true,
        get: () => href?.get?.call(location) as string,
        set: (url: string) => {
          if (domTakes || navigate({ url: at(url), navigationType: "push" })) {
            byDom(() => href?.set?.call(location, url));
          }
        },
      },
    });

  // `history`: a navigation of the same document, which the browser fires
  // before the URL changes. Writable, as the DOM's: Next's router wraps
  // them.
  for (const [name, navigationType] of [
    ["pushState", "push"],
    ["replaceState", "replace"],
  ] as const) {
    const original = history[name].bind(history);
    Object.defineProperty(history, name, {
      configurable: true,
      writable: true,
      value: (state: unknown, unused: string, url?: string | URL | null) => {
        if (!domTakes)
          navigate({ url: at(url ?? location.href), navigationType, sameDocument: true });
        original(state, unused, url);
      },
    });
  }

  return navigation;
}

// The entries a form submits, with the button that submits it, as a browser
// has them.
function formDataOf(form: HTMLFormElement, submitter: HTMLElement | null): FormData {
  try {
    return new FormData(form, submitter);
  } catch {
    const formData = new FormData(form);
    const name = submitter?.getAttribute("name");
    if (name) formData.append(name, (submitter as HTMLButtonElement).value);
    return formData;
  }
}

function descriptorOf(target: object, name: string): PropertyDescriptor | undefined {
  for (let at: object | null = target; at; at = Object.getPrototypeOf(at) as object | null) {
    const descriptor = Object.getOwnPropertyDescriptor(at, name);
    if (descriptor) return descriptor;
  }
}
