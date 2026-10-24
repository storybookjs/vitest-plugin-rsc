import { ada, createSession, createUser, seedNotes } from "#test/db.ts";

// The notes app as the primitives use it: a signed-in user with 20 notes.

export const noteCount = 20;

/** Ada with a session and 20 notes, "Note 01" the oldest; her cookie in the page. */
export async function seedApp() {
  const user = await createUser(ada);
  const token = await createSession(user.id);
  const notes = await seedNotes(
    user.id,
    Array.from({ length: noteCount }, (_, i) => ({
      title: `Note ${String(i + 1).padStart(2, "0")}`,
      content: `Content of note ${i + 1}`,
    })),
  );
  signIn(token);
  return { user, token, notes };
}

/** The session cookie in the page's requests: again after `newBrowserContext()`. */
export function signIn(token: string): void {
  document.cookie = `session=${token}; path=/`;
}

/** Whether the page shows an `<h1>` with this text. */
export function hasHeading(text: string): boolean {
  for (const heading of document.getElementsByTagName("h1")) {
    if (heading.textContent === text && heading.isConnected) return true;
  }
  return false;
}

export function linkTo(href: string): HTMLAnchorElement {
  const link = document.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);
  if (!link) throw new Error(`No link to ${href}`);
  return link;
}

export function buttonNamed(name: string): HTMLButtonElement {
  for (const button of document.querySelectorAll("button")) {
    if (button.textContent === name) return button;
  }
  throw new Error(`No button "${name}"`);
}

const setters = new Map<object, (value: string) => void>();
/** Sets the value as the browser does for typing, so React sees it: the prototype's setter. */
export function setValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) {
  const prototype = Object.getPrototypeOf(element) as object;
  let setter = setters.get(prototype);
  if (!setter) {
    setter = Object.getOwnPropertyDescriptor(prototype, "value")!.set!;
    setters.set(prototype, setter);
  }
  setter.call(element, value);
}
