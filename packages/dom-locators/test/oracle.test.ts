// The oracle table: each locator of the table, on each fixture, finds the
// elements that Vitest's own `page` finds, in the same order, and has the
// selector and the printed locator Vitest has for it. Or it throws the error
// Vitest's throws. The oracle is the engine whose semantics the package
// claims: Playwright's, as `vitest/browser` runs it in the page.

import { expect, test } from "vitest";
import { page as vitestPage } from "vitest/browser";
import { page } from "../src/index.ts";
import { ariaFixture, notesFixtures } from "./fixtures.ts";

// A locator of the table, which both pages build alike.
// oxlint-disable-next-line typescript/no-explicit-any
type Build = (page: any) => any;
type Row = [name: string, build: Build];

const roles = [
  "article",
  "banner",
  "blockquote",
  "button",
  "caption",
  "cell",
  "checkbox",
  "code",
  "columnheader",
  "combobox",
  "complementary",
  "contentinfo",
  "definition",
  "dialog",
  "document",
  "emphasis",
  "form",
  "grid",
  "gridcell",
  "group",
  "heading",
  "img",
  "link",
  "list",
  "listbox",
  "listitem",
  "main",
  "meter",
  "navigation",
  "none",
  "option",
  "paragraph",
  "presentation",
  "progressbar",
  "radio",
  "region",
  "row",
  "rowgroup",
  "rowheader",
  "searchbox",
  "separator",
  "slider",
  "spinbutton",
  "status",
  "strong",
  "switch",
  "tab",
  "table",
  "tablist",
  "term",
  "textbox",
  "time",
  "tree",
  "treeitem",
  "alert",
  "Button",
];

const names: [role: string, name: string | RegExp][] = [
  ["button", "Save"],
  ["button", "save"],
  ["button", "Save draft"],
  ["button", "Span button"],
  ["button", "Trash"],
  ["button", "Close dialog"],
  ["button", "Labelled by two"],
  ["button", "Only a title"],
  ["button", "Before pseudo"],
  ["button", "pseudo after"],
  ["button", "Block text"],
  ["button", "Bold"],
  ["button", "Menu"],
  ["button", "Disabled"],
  ["button", "Send form"],
  ["button", "Input button"],
  ["button", "Reset"],
  ["button", "Image submit"],
  ["button", "Gone button"],
  ["button", "Invisible button"],
  ["button", "ARIA hidden button"],
  ["button", "Contents button"],
  ["button", "Div button"],
  ["button", "Button with role none"],
  ["button", "In legend"],
  ["button", /^save/i],
  ["button", /Save$/],
  ["button", ""],
  ["link", "Home"],
  ["link", "home"],
  ["link", "Docs and guides"],
  ["link", "Settings"],
  ["link", "Labelled link"],
  ["link", "Ignored text"],
  ["link", "Titled link"],
  ["link", "Block link"],
  ["link", "No href"],
  ["link", /home/],
  ["heading", "Main title"],
  ["heading", "Spaced heading"],
  ["heading", "  Spaced   heading "],
  ["heading", "Level override"],
  ["heading", "Div heading"],
  ["navigation", "Primary"],
  ["region", "Named section"],
  ["form", "Login"],
  ["textbox", "Email address"],
  ["textbox", "you@example.com"],
  ["textbox", "Password"],
  ["textbox", "Free text"],
  ["textbox", "Type here"],
  ["textbox", "Titled input"],
  ["textbox", "Labelled"],
  ["textbox", "Message"],
  ["textbox", "Shared"],
  ["textbox", "Shared Second label"],
  ["searchbox", "Find"],
  ["combobox", "With list"],
  ["combobox", "Fruit"],
  ["combobox", "Choose"],
  ["listbox", "Fruits"],
  ["checkbox", "Checked box"],
  ["checkbox", "Div checkbox"],
  ["radio", "Radio three"],
  ["option", "Pear"],
  ["status", "Result"],
  ["img", "A chart"],
  ["img", "Svg title"],
  ["img", "Trash"],
  ["dialog", "Settings dialog"],
  ["table", "Scores"],
  ["columnheader", "Name"],
  ["rowheader", "Ada"],
  ["cell", "10"],
  ["row", "Ada 10"],
  ["tab", "First tab"],
  ["treeitem", "Root"],
  ["group", "More"],
  ["paragraph", "Some strong text and a word."],
];

const texts: (string | RegExp)[] = [
  "Save",
  "save",
  "Duplicate",
  "duplicate",
  "Duplicate text",
  "Main title",
  "Spaced heading",
  "Some strong text",
  "strong",
  "word",
  "Nested inner",
  "inner",
  "Non breaking",
  "Non breakingspace",
  "Send form",
  "Gone button",
  "Script text",
  "Card",
  "Card title",
  "Details text",
  "Closed text",
  "Page footer",
  "Contact",
  "",
  "nothing like this",
  /dup/i,
  /^Duplicate$/,
  /Card/,
  /inner/g,
];

const rows: Row[] = [];
const literal = (value: unknown) =>
  value instanceof RegExp ? String(value) : JSON.stringify(value);

for (const role of roles) {
  rows.push([`getByRole(${role})`, (p) => p.getByRole(role)]);
  rows.push([
    `getByRole(${role}, includeHidden)`,
    (p) => p.getByRole(role, { includeHidden: true }),
  ]);
}
for (const [role, name] of names) {
  rows.push([`getByRole(${role}, ${literal(name)})`, (p) => p.getByRole(role, { name })]);
  if (typeof name === "string") {
    rows.push([
      `getByRole(${role}, ${literal(name)}, exact)`,
      (p) => p.getByRole(role, { name, exact: true }),
    ]);
    rows.push([
      `getByRole(${role}, ${literal(name)}, not exact)`,
      (p) => p.getByRole(role, { name, exact: false }),
    ]);
    rows.push([
      `getByRole(${role}, ${literal(name)}, includeHidden)`,
      (p) => p.getByRole(role, { name, includeHidden: true }),
    ]);
  }
}
for (const options of [
  { checked: true },
  { checked: false },
  { pressed: true },
  { pressed: false },
  { expanded: true },
  { expanded: false },
  { disabled: true },
  { disabled: false },
  { level: 1 },
  { level: 2 },
  { level: 5 },
  { level: 6 },
  { selected: true },
]) {
  const [key] = Object.keys(options);
  const role =
    key === "checked"
      ? "checkbox"
      : key === "pressed" || key === "disabled"
        ? "button"
        : key === "expanded"
          ? "button"
          : key === "level"
            ? "heading"
            : "option";
  rows.push([`getByRole(${role}, ${JSON.stringify(options)})`, (p) => p.getByRole(role, options)]);
}
rows.push(["getByRole(radio, checked)", (p) => p.getByRole("radio", { checked: true })]);
rows.push(["getByRole(switch, checked false)", (p) => p.getByRole("switch", { checked: false })]);
rows.push(["getByRole(gridcell, selected)", (p) => p.getByRole("gridcell", { selected: true })]);
rows.push(["getByRole(tab, selected false)", (p) => p.getByRole("tab", { selected: false })]);
rows.push([
  "getByRole(treeitem, level 1, expanded)",
  (p) => p.getByRole("treeitem", { level: 1, expanded: true }),
]);
rows.push([
  "getByRole(textbox, disabled false)",
  (p) => p.getByRole("textbox", { disabled: false }),
]);
rows.push([
  "getByRole(button, disabled, hidden)",
  (p) => p.getByRole("button", { disabled: true, includeHidden: true }),
]);

for (const text of texts) {
  rows.push([`getByText(${literal(text)})`, (p) => p.getByText(text)]);
  if (typeof text === "string") {
    rows.push([`getByText(${literal(text)}, exact)`, (p) => p.getByText(text, { exact: true })]);
    rows.push([
      `getByText(${literal(text)}, not exact)`,
      (p) => p.getByText(text, { exact: false }),
    ]);
  }
}
for (const text of [
  "Email address",
  "email",
  "Password",
  "Free text",
  "Labelled",
  "Shared",
  "Second label",
  "Message",
  "Radio three",
  "Fruit",
  "Choose",
  "Count",
  "Hidden input",
  "Result",
  /pass/i,
  "nothing",
]) {
  rows.push([`getByLabelText(${literal(text)})`, (p) => p.getByLabelText(text)]);
  if (typeof text === "string") {
    rows.push([
      `getByLabelText(${literal(text)}, exact)`,
      (p) => p.getByLabelText(text, { exact: true }),
    ]);
    rows.push([
      `getByLabelText(${literal(text)}, not exact)`,
      (p) => p.getByLabelText(text, { exact: false }),
    ]);
  }
}
for (const [method, values] of [
  ["getByPlaceholder", ["you@example.com", "YOU@", "Type here", /type/i, "nothing"]],
  ["getByAltText", ["Settings", "settings", "A chart", "Image submit", /chart/, ""]],
  ["getByTitle", ["Tooltip text", "tooltip", "Titled input", "Chart title", /title/i]],
] as const) {
  for (const value of values) {
    rows.push([`${method}(${literal(value)})`, (p) => p[method](value)]);
    if (typeof value === "string") {
      rows.push([`${method}(${literal(value)}, exact)`, (p) => p[method](value, { exact: true })]);
      rows.push([
        `${method}(${literal(value)}, not exact)`,
        (p) => p[method](value, { exact: false }),
      ]);
    }
  }
}
for (const testId of ["card", "Card", "card-title", "car", /card/, /^Card$/i, "other"]) {
  rows.push([`getByTestId(${literal(testId)})`, (p) => p.getByTestId(testId)]);
}

// Chains, filters and the rest of the locator.
rows.push(
  ["navigation > link", (p) => p.getByRole("navigation").getByRole("link")],
  [
    "navigation Primary > link Home",
    (p) => p.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Home" }),
  ],
  ["listitem > link", (p) => p.getByRole("listitem").getByRole("link")],
  ["main > button Save", (p) => p.getByRole("main").getByRole("button", { name: "Save" })],
  ["list > listitem > text", (p) => p.getByRole("list").getByRole("listitem").getByText("Docs")],
  ["text in text", (p) => p.getByText("Nested").getByText("inner")],
  ["text in itself", (p) => p.getByText("inner").getByText("inner")],
  ["form > textbox", (p) => p.getByRole("form").getByRole("textbox")],
  ["testid > text", (p) => p.getByTestId("card").getByText("title")],
  ["nth(0)", (p) => p.getByRole("button").nth(0)],
  ["nth(3)", (p) => p.getByRole("button").nth(3)],
  ["nth(-1)", (p) => p.getByRole("button").nth(-1)],
  ["nth(-2)", (p) => p.getByRole("button").nth(-2)],
  ["nth(999)", (p) => p.getByRole("button").nth(999)],
  ["first", (p) => p.getByRole("link").first()],
  ["last", (p) => p.getByRole("link").last()],
  ["nth of chain", (p) => p.getByRole("listitem").nth(1).getByRole("link")],
  ["filter hasText", (p) => p.getByRole("listitem").filter({ hasText: "docs" })],
  ["filter hasText regex", (p) => p.getByRole("listitem").filter({ hasText: /^Home$/ })],
  ["filter hasNotText", (p) => p.getByRole("listitem").filter({ hasNotText: "Home" })],
  ["filter has", (p) => p.getByRole("listitem").filter({ has: p.getByRole("img") })],
  ["filter hasNot", (p) => p.getByRole("listitem").filter({ hasNot: p.getByRole("link") })],
  [
    "filter has text of itself",
    (p) => p.getByRole("paragraph").filter({ has: p.getByText("strong") }),
  ],
  [
    "filter both",
    (p) => p.getByRole("button").filter({ hasText: "Menu", hasNot: p.getByText("x") }),
  ],
  [
    "filter empty hasText",
    (p) => p.getByRole("listitem").filter({ hasText: "", has: p.getByRole("link") }),
  ],
  ["and", (p) => p.getByRole("button").and(p.getByText("Save"))],
  ["and title", (p) => p.getByRole("textbox").and(p.getByTitle("Titled input"))],
  ["or", (p) => p.getByRole("heading", { level: 1 }).or(p.getByRole("button", { name: "Save" }))],
  [
    "or reversed",
    (p) => p.getByRole("button", { name: "Save" }).or(p.getByRole("heading", { level: 1 })),
  ],
  ["or overlapping", (p) => p.getByRole("link").or(p.getByRole("listitem"))],
  [
    "chain after or",
    (p) => p.getByRole("navigation").or(p.getByRole("contentinfo")).getByRole("link"),
  ],
  [
    "chain in and",
    (p) => p.getByRole("link").and(p.getByRole("navigation").getByRole("link", { name: "Docs" })),
  ],
);

/** An element as the report names it. */
const nameOf = (element: Element) =>
  element.id ? `#${element.id}` : element.outerHTML.slice(0, 60).replace(/\s+/g, " ");

type Answer = { elements: string[] } | { error: string };
function answer(build: Build, of: unknown): Answer {
  try {
    return { elements: (build(of).elements() as Element[]).map(nameOf) };
  } catch (error) {
    return { error: (error as Error).message.split("\n")[0]! };
  }
}

function compare(fixture: string, extraRows: Row[]): { compared: number; mismatches: string[] } {
  document.body.innerHTML = fixture;
  const mismatches: string[] = [];
  for (const [name, build] of [...rows, ...extraRows]) {
    const ours = answer(build, page);
    const theirs = answer(build, vitestPage);
    if (JSON.stringify(ours) !== JSON.stringify(theirs)) {
      mismatches.push(
        `${name}:\n  ours   ${JSON.stringify(ours)}\n  Vitest ${JSON.stringify(theirs)}`,
      );
      continue;
    }
    if ("error" in ours) continue;
    const our = build(page);
    const their = build(vitestPage);
    if (our.selector !== their.selector) {
      mismatches.push(`${name}: selector\n  ours   ${our.selector}\n  Vitest ${their.selector}`);
    }
    if (our.asLocator() !== their.asLocator()) {
      mismatches.push(
        `${name}: asLocator\n  ours   ${our.asLocator()}\n  Vitest ${their.asLocator()}`,
      );
    }
  }
  return { compared: rows.length + extraRows.length, mismatches };
}

test("every locator of the table finds what Vitest's page finds, on the ARIA page", () => {
  const { compared, mismatches } = compare(ariaFixture, []);
  expect(mismatches.join("\n")).toBe("");
  expect(compared).toBeGreaterThan(400);
});

// The locators of the benchmark's 22 test files, and more of the same kind.
const notesRows: Row[] = [
  ["Title", (p) => p.getByLabelText("Title")],
  ["Password", (p) => p.getByLabelText("Password")],
  ["Email", (p) => p.getByLabelText("Email")],
  ["Content", (p) => p.getByLabelText("Content")],
  ["Name", (p) => p.getByLabelText("Name")],
  ["Search label", (p) => p.getByLabelText("Search")],
  ["Create note", (p) => p.getByRole("button", { name: "Create note" })],
  ["Save note", (p) => p.getByRole("button", { name: "Save note" })],
  ["All notes", (p) => p.getByRole("link", { name: "All notes" })],
  ["Unfavorite", (p) => p.getByRole("button", { name: "Unfavorite" })],
  ["Favorite exact", (p) => p.getByRole("button", { name: "Favorite", exact: true })],
  ["Favorite", (p) => p.getByRole("button", { name: "Favorite" })],
  ["Delete", (p) => p.getByRole("button", { name: "Delete" })],
  ["main Sign in", (p) => p.getByRole("main").getByRole("button", { name: "Sign in" })],
  ["Sign in", (p) => p.getByRole("button", { name: "Sign in" })],
  ["Sign in link", (p) => p.getByRole("link", { name: "Sign in" })],
  ["Create account", (p) => p.getByRole("button", { name: "Create account" })],
  ["Sign out", (p) => p.getByRole("button", { name: "Sign out" })],
  ["Edit", (p) => p.getByRole("link", { name: "Edit" })],
  ["Save name", (p) => p.getByRole("button", { name: "Save name" })],
  ["New note", (p) => p.getByRole("link", { name: "New note" })],
  ["Profile", (p) => p.getByRole("link", { name: "Profile" })],
  ["Search button", (p) => p.getByRole("button", { name: "Search" })],
  ["main Cancel", (p) => p.getByRole("main").getByRole("link", { name: "Cancel" })],
  ["Notes exact", (p) => p.getByRole("link", { name: "Notes", exact: true })],
  ["Notes", (p) => p.getByRole("link", { name: "Notes" })],
  ["Groceries link", (p) => p.getByRole("link", { name: "Groceries" })],
  ["Groceries exact", (p) => p.getByRole("link", { name: "Groceries", exact: true })],
  ["Groceries heading", (p) => p.getByRole("heading", { name: "Groceries" })],
  ["Notes heading", (p) => p.getByRole("heading", { name: "Notes" })],
  ["list Notes > link", (p) => p.getByRole("list", { name: "Notes" }).getByRole("link")],
  ["Note deleted.", (p) => p.getByText("Note deleted.")],
  ["Note created.", (p) => p.getByText("Note created.")],
  ["Title is required.", (p) => p.getByText("Title is required.")],
  ["not found", (p) => p.getByText("This page could not be found.")],
  ["Signed in as", (p) => p.getByText("Signed in as Ada Lovelace")],
  ["No notes yet", (p) => p.getByText("No notes yet")],
  ["Invalid", (p) => p.getByText("Invalid email or password.")],
  ["1 note exact", (p) => p.getByText("1 note", { exact: true })],
  ["3 notes", (p) => p.getByText("3 notes")],
  ["0 notes", (p) => p.getByText("0 notes")],
  ["Favorite text", (p) => p.getByText("★ Favorite")],
  ["Welcome", (p) => p.getByText("Welcome, Ada Lovelace!")],
  ["Oat milk", (p) => p.getByText("Oat milk")],
  ["Oat milk, bread", (p) => p.getByText("Oat milk, bread")],
  ["No content yet.", (p) => p.getByText("No content yet.")],
  ["Name saved.", (p) => p.getByText("Name saved.")],
  ["Email:", (p) => p.getByText("Email: ada@example.com")],
  ["You have 1 note.", (p) => p.getByText("You have 1 note.")],
  ["note", (p) => p.getByText("note")],
  ["note not exact", (p) => p.getByText("note", { exact: false })],
  ["notes not exact", (p) => p.getByRole("link", { name: "notes", exact: false })],
  ["sign in not exact", (p) => p.getByRole("button", { name: "sign", exact: false })],
  [
    "listitem filter favorite",
    (p) => p.getByRole("listitem").filter({ hasText: "Favorite" }).getByRole("link"),
  ],
  ["textbox", (p) => p.getByRole("textbox")],
  ["searchbox", (p) => p.getByRole("searchbox", { name: "Search" })],
  ["status", (p) => p.getByRole("status")],
  ["pressed", (p) => p.getByRole("button", { pressed: true })],
  ["disabled", (p) => p.getByRole("button", { disabled: true })],
];

test("every locator of the benchmark finds what Vitest's page finds, on each route of the notes app", () => {
  const results = Object.entries(notesFixtures).map(([route, html]) => {
    const { compared, mismatches } = compare(html, notesRows);
    return { route, compared, mismatches };
  });
  expect(
    results.flatMap(({ route, mismatches }) => mismatches.map((m) => `${route}: ${m}`)).join("\n"),
  ).toBe("");
});

test("a locator of an element finds what Vitest's finds, and the getBy* in it", () => {
  document.body.innerHTML = ariaFixture;
  const nav = document.getElementById("nav-primary")!;
  const pairs: Row[] = [
    ["elementLocator", (p) => p.elementLocator(nav)],
    ["elementLocator > link", (p) => p.elementLocator(nav).getByRole("link")],
    ["elementLocator > text", (p) => p.elementLocator(nav).getByText("home")],
    ["elementLocator of html", (p) => p.elementLocator(document.documentElement).getByRole("main")],
    ["all", (p) => p.getByRole("listitem").all()[1].getByRole("link")],
  ];
  for (const [name, build] of pairs) {
    expect(answer(build, page), name).toEqual(answer(build, vitestPage));
  }
});
