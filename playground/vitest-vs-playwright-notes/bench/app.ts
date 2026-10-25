import { db } from "#lib/db.ts";
import { createSession, createUser, seedNotes } from "#test/db.ts";
import { ada } from "#test/people.ts";

// The notes app as the primitives use it: a signed-in user with 20 notes, in
// tables emptied first, so that each primitive runs on the same rows, however
// many the primitives before it added.

export const noteCount = 20;

// The statements of `resetDb()`, sent at once: one round trip, where five
// took one each. DELETE, not TRUNCATE, which rewrites the files of the tables
// and their indexes. And setval for the ids.
const emptyTables = [
  "DELETE FROM sessions",
  "DELETE FROM notes",
  "DELETE FROM users",
  "SELECT setval('users_id_seq', 1, false)",
  "SELECT setval('notes_id_seq', 1, false)",
].join(";\n");

/**
 * Empties the tables. By the client of the driver: a query of drizzle is one
 * statement. PGlite's `exec()` takes several.
 */
export async function resetDb(): Promise<void> {
  // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- PGlite in the page.
  const client = db.$client as unknown as { exec: (sql: string) => Promise<unknown> };
  await client.exec(emptyTables);
}

/**
 * Ada with a session and 20 notes, "Note 01" the oldest, alone in the tables;
 * her cookie in the page.
 */
export async function seedApp() {
  await resetDb();
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
