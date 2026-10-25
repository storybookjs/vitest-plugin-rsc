import { page as domPage } from "dom-locators";
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { seedApp } from "./app.ts";

// The oracle of dom-locators on the app's own pages, as the plugin renders
// them, with all that Next puts on a page, like the shadow root of its
// `<next-route-announcer>`: each locator finds what Vitest's own finds, in
// the same order, with the same selector and the same printed locator, or
// throws the same error. Not a timing: the job of the primitives runs it.

// oxlint-disable-next-line typescript/no-explicit-any
type Build = (page: any) => any;

const locators: [name: string, build: Build][] = [
  ["Title", (p) => p.getByLabelText("Title")],
  ["Content", (p) => p.getByLabelText("Content")],
  ["Email", (p) => p.getByLabelText("Email")],
  ["Password", (p) => p.getByLabelText("Password")],
  ["Search", (p) => p.getByLabelText("Search")],
  ["Create note", (p) => p.getByRole("button", { name: "Create note" })],
  ["Save note", (p) => p.getByRole("button", { name: "Save note" })],
  ["Favorite", (p) => p.getByRole("button", { name: "Favorite", exact: true })],
  ["Favorite, not exact", (p) => p.getByRole("button", { name: "favorite", exact: false })],
  ["Delete", (p) => p.getByRole("button", { name: "Delete" })],
  ["Sign out", (p) => p.getByRole("button", { name: "Sign out" })],
  ["main > Sign in", (p) => p.getByRole("main").getByRole("button", { name: "Sign in" })],
  ["All notes", (p) => p.getByRole("link", { name: "All notes" })],
  ["Edit", (p) => p.getByRole("link", { name: "Edit" })],
  ["New note", (p) => p.getByRole("link", { name: "New note" })],
  ["Notes, exact", (p) => p.getByRole("link", { name: "Notes", exact: true })],
  ["Note 07", (p) => p.getByRole("link", { name: "Note 07", exact: true })],
  ["note, not exact", (p) => p.getByRole("link", { name: "note", exact: false })],
  ["list Notes > link", (p) => p.getByRole("list", { name: "Notes" }).getByRole("link")],
  ["listitem filter", (p) => p.getByRole("listitem").filter({ hasText: "Note 1" })],
  ["navigation Main > link", (p) => p.getByRole("navigation", { name: "Main" }).getByRole("link")],
  ["links", (p) => p.getByRole("link")],
  ["buttons", (p) => p.getByRole("button")],
  ["headings", (p) => p.getByRole("heading")],
  ["heading Notes", (p) => p.getByRole("heading", { name: "Notes" })],
  ["textboxes", (p) => p.getByRole("textbox")],
  ["searchbox", (p) => p.getByRole("searchbox")],
  ["alert, Next's route announcer", (p) => p.getByRole("alert")],
  ["alert, hidden too", (p) => p.getByRole("alert", { includeHidden: true })],
  ["status", (p) => p.getByRole("status")],
  ["20 notes", (p) => p.getByText("20 notes")],
  ["Signed in as", (p) => p.getByText("Signed in as Ada Lovelace")],
  ["Note, not exact", (p) => p.getByText("Note", { exact: false })],
  ["Content of note 7", (p) => p.getByText("Content of note 7")],
  ["Sign in text", (p) => p.getByText("Sign in")],
  ["paragraphs", (p) => p.getByRole("paragraph")],
  ["first link", (p) => p.getByRole("link").first()],
  ["last button", (p) => p.getByRole("button").last()],
];

type Answer = { elements: string[]; selector: string; locator: string } | { error: string };

const nameOf = (element: Element) =>
  `${element.localName}${element.id ? `#${element.id}` : ""}:${(element.textContent ?? "").trim().slice(0, 30)}`;

function answer(build: Build, of: unknown): Answer {
  try {
    const locator = build(of);
    const elements = (locator.elements() as Element[]).map(nameOf);
    return { elements, selector: locator.selector, locator: locator.asLocator() };
  } catch (error) {
    return { error: (error as Error).message.split("\n")[0]! };
  }
}

function mismatches(route: string): string[] {
  return locators.flatMap(([name, build]) => {
    const ours = JSON.stringify(answer(build, domPage));
    const theirs = JSON.stringify(answer(build, page));
    return ours === theirs
      ? []
      : [`${route} ${name}:\n  dom-locators ${ours}\n  Vitest       ${theirs}`];
  });
}

test("the locators of dom-locators find what Vitest's find, on the app's routes", async () => {
  // Signed out first: the sign-in page, which sends a signed-in user on.
  await renderServer({ url: "/sign-in" });
  const found = mismatches("/sign-in");
  const { notes } = await seedApp();
  for (const url of [
    "/notes",
    `/notes/${notes[6]!.id}`,
    `/notes/${notes[6]!.id}/edit`,
    "/notes/new",
    "/profile",
  ]) {
    await renderServer({ url });
    found.push(...mismatches(url));
  }
  expect(found.join("\n")).toBe("");
});
