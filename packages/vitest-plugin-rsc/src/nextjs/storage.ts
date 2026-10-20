// The browser's storage of the document between two cleanups, as the app's
// page sees it: what `localStorage` and `sessionStorage` hold. A browser
// gives the document one storage for its origin, which every other document
// of the origin shares, like the host's own or another page of the app next
// to this one. So the page's storage is a `Storage` of the plugin's, as its
// cookie jar is: see page-store.ts. Evaluating this module installs it, as
// app-requests.ts installs the page's `document.cookie`.

/**
 * The items of the page's `localStorage` and `sessionStorage`. One for the
 * document between two cleanups: `cleanup()` makes a new one.
 */
class PageStorage {
  readonly localStorage = new Map<string, string>();
  readonly sessionStorage = new Map<string, string>();
}

// The items of each `Storage` that `storageOf()` made, as they are now.
const sources = new WeakMap<object, () => Map<string, string>>();
const itemsOf = (storage: Storage) => sources.get(storage)!();

// The methods and `length` of a storage of the plugin's. The browser's, on
// `Storage.prototype`, are for a storage of the browser's: they throw for
// any other. So these are on a prototype of its own between the two, as
// enumerable as the browser's.
const storagePrototype = Object.create(Storage.prototype, {
  length: {
    get(this: Storage) {
      return itemsOf(this).size;
    },
    enumerable: true,
    configurable: true,
  },
  ...Object.getOwnPropertyDescriptors({
    key(this: Storage, index: number): string | null {
      // An `unsigned long`, as the browser takes it: -1 is past the end.
      return [...itemsOf(this).keys()][index >>> 0] ?? null;
    },
    getItem(this: Storage, key: string): string | null {
      return itemsOf(this).get(`${key}`) ?? null;
    },
    setItem(this: Storage, key: string, value: string): void {
      itemsOf(this).set(`${key}`, `${value}`);
    },
    removeItem(this: Storage, key: string): void {
      itemsOf(this).delete(`${key}`);
    },
    clear(this: Storage): void {
      itemsOf(this).clear();
    },
  }),
}) as Storage;

/**
 * A `Storage` of the items that `items()` returns each time it is used. Its
 * items are its properties too, as in a browser: `storage.theme`,
 * `Object.keys(storage)` and `JSON.stringify(storage)` have them, and setting
 * or deleting a property sets or removes an item. A name of `Storage`, like
 * `key` or `length`, hides the item of that name.
 */
function storageOf(items: () => Map<string, string>): Storage {
  const target = Object.create(storagePrototype) as Storage;
  const isItem = (name: string | symbol): name is string =>
    typeof name === "string" && !(name in target) && items().has(name);
  const storage = new Proxy(target, {
    get: (target, name, receiver) =>
      isItem(name) ? items().get(name) : Reflect.get(target, name, receiver),
    // A name of `Storage`, like `setItem`, is an ordinary property when set
    // or defined, as in the browser: a spy on `storage.setItem` sees the
    // calls.
    set(target, name, value, receiver) {
      if (typeof name !== "string" || name in target || receiver !== storage) {
        return Reflect.set(target, name, value, receiver);
      }
      items().set(name, `${value}`);
      return true;
    },
    has: (target, name) => isItem(name) || Reflect.has(target, name),
    deleteProperty: (target, name) =>
      isItem(name) ? items().delete(name) : Reflect.deleteProperty(target, name),
    ownKeys: (target) => [...[...items().keys()].filter(isItem), ...Reflect.ownKeys(target)],
    getOwnPropertyDescriptor: (target, name) =>
      isItem(name)
        ? { value: items().get(name), writable: true, enumerable: true, configurable: true }
        : Reflect.getOwnPropertyDescriptor(target, name),
    defineProperty(target, name, descriptor) {
      if (typeof name !== "string" || name in target) {
        return Reflect.defineProperty(target, name, descriptor);
      }
      // As in a browser, a property with a value is an item.
      if (!("value" in descriptor)) return false;
      items().set(name, `${descriptor.value}`);
      return true;
    },
    // As in a browser, a storage cannot be frozen or sealed.
    preventExtensions: () => false,
  });
  sources.set(storage, items);
  return storage;
}

// The items of the page's `localStorage` and `sessionStorage`, until the test
// ends: `cleanup()` makes a new one, as it makes a new store.
let storage = new PageStorage();

/** Forgets the items: the page's storage is empty from here on. */
export function newPageStorage(): void {
  storage = new PageStorage();
}

// A script of the page stores in `localStorage` and `sessionStorage`, as in a
// browser. Those are the page's own, as its cookies are: the browser's own
// storage is the origin's, with what other documents store in it, like
// Vitest's UI, the manager document of another host or another page of the
// app next to this one. The app neither reads nor writes it. Each is one
// object until the document goes, so code that took it as it loaded has the
// items of the page that is open. The page hears the browser's `storage`
// events, which are about the host's storage, never its own.
for (const name of ["localStorage", "sessionStorage"] as const) {
  const pageStorage = storageOf(() => storage[name]);
  Object.defineProperty(window, name, {
    configurable: true,
    enumerable: true,
    get: () => pageStorage,
  });
}
