import { queries as tl } from "@testing-library/dom";
import { userEvent } from "@testing-library/user-event";
import { test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { seedNotes } from "#test/db.ts";
import { signedIn } from "#test/vitest.ts";
import { click, expect, fill, screen, stats, useEngine } from "#test/fast-dom.ts";

// Within-run micro-benchmarks of test/fast-dom.ts against Vitest's locators,
// Testing Library's queries and user-event: rounds interleaved, medians of the
// per-operation microseconds. Printed as one FASTDOM-MICRO line of JSON.

const results: Record<string, number[]> = {};
const notes: Record<string, unknown> = {};
function record(name: string, us: number) {
  (results[name] ??= []).push(us);
}
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};
function time(name: string, ops: number, op: (i: number) => unknown) {
  const start = performance.now();
  for (let i = 0; i < ops; i++) op(i);
  record(name, ((performance.now() - start) * 1000) / ops);
}
async function timeAsync(name: string, ops: number, op: (i: number) => Promise<unknown>) {
  const start = performance.now();
  for (let i = 0; i < ops; i++) await op(i);
  record(name, ((performance.now() - start) * 1000) / ops);
}
const rounds = 7;
const t0 = performance.now();
const progress = (what: string) =>
  console.log(`FASTDOM-PROGRESS ${what} ${Math.round(performance.now() - t0)} ms`);
const same = (a: Element[], b: Element[]) => a.length === b.length && a.every((e, i) => e === b[i]);

type Spec = {
  name: string;
  vitest: () => Element[];
  vitestHidden?: () => Element[];
  tl: () => Element[];
  tlHidden?: () => Element[];
  tlNoName?: () => Element[];
  fast: () => Element[];
  fastNoName?: () => Element[];
  fastHidden?: () => Element[];
};
const body = () => document.body;
function role(r: string, name?: string): Spec {
  const opts = name === undefined ? undefined : { name };
  return {
    name: `getByRole(${r}${name === undefined ? "" : `, ${name}`})`,
    vitest: () => page.getByRole(r as "button", { ...opts, exact: true }).elements(),
    vitestHidden: () =>
      page.getByRole(r as "button", { ...opts, exact: true, includeHidden: true }).elements(),
    tl: () => tl.queryAllByRole(body(), r, opts),
    tlHidden: () => tl.queryAllByRole(body(), r, { ...opts, hidden: true }),
    tlNoName: name === undefined ? undefined : () => tl.queryAllByRole(body(), r),
    fast: () => screen.getByRole(r as "button", opts).elements(),
    fastNoName: name === undefined ? undefined : () => screen.getByRole(r as "button").elements(),
    fastHidden: () => screen.getByRole(r as "button", { ...opts, hidden: true }).elements(),
  };
}
const label = (text: string): Spec => ({
  name: `getByLabelText(${text})`,
  vitest: () => page.getByLabelText(text, { exact: true }).elements(),
  tl: () => tl.queryAllByLabelText(body(), text),
  fast: () => screen.getByLabelText(text).elements(),
});
const text = (t: string): Spec => ({
  name: `getByText(${t})`,
  vitest: () => page.getByText(t, { exact: true }).elements(),
  tl: () => tl.queryAllByText(body(), t),
  fast: () => screen.getByText(t).elements(),
});

function benchQueries(specs: Spec[], ops: number) {
  for (const spec of specs) {
    const reference = spec.tl();
    for (const [engine, get] of Object.entries(spec)) {
      if (engine === "name" || typeof get !== "function") continue;
      const found = (get as () => Element[])();
      if (
        engine !== "tlNoName" &&
        engine !== "fastNoName" &&
        !engine.endsWith("Hidden") &&
        !same(found, reference)
      ) {
        notes[`${spec.name} ${engine} differs`] = `${found.length} vs TL ${reference.length}`;
      }
    }
  }
  for (let r = 0; r < rounds; r++) {
    for (const spec of specs) {
      for (const [engine, get] of Object.entries(spec)) {
        if (engine === "name" || typeof get !== "function") continue;
        time(`query ${spec.name} ${engine}`, ops, get as () => unknown);
      }
    }
  }
}

test("micro", { timeout: 300_000 }, async () => {
  const user = await signedIn();
  await seedNotes(
    user.id,
    Array.from({ length: 10 }, (_, i) => ({
      title: `Note ${i}`,
      content: `Content ${i}`,
      favorite: i % 3 === 0,
    })),
  );
  await renderServer({ url: "/notes" });
  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeInTheDocument();
  notes["notes elements"] = document.body.querySelectorAll("*").length;

  // 1. Queries on /notes.
  benchQueries(
    [
      role("heading", "Notes"),
      role("button", "Search"),
      role("button", "Sign out"),
      role("link", "New note"),
      role("link", "Note 5"),
      role("list", "Notes"),
      role("navigation", "Main"),
      label("Search"),
      text("10 notes"),
      text("Signed in as Ada Lovelace"),
    ],
    200,
  );
  progress("queries /notes");
  // Chained, as expectTitles(): the links of the list.
  for (let r = 0; r < rounds; r++) {
    time("query list>links vitest", 200, () =>
      page.getByRole("list", { name: "Notes" }).getByRole("link").elements(),
    );
    time("query list>links fast", 200, () =>
      screen.getByRole("list", { name: "Notes" }).getByRole("link").elements(),
    );
    useEngine("testing-library");
    time("query list>links tl", 200, () =>
      screen.getByRole("list", { name: "Notes" }).getByRole("link").elements(),
    );
    useEngine("fast");
  }

  progress("chained");
  // 2. Assertions on an element that is there.
  const vitestHeading = page.getByRole("heading", { name: "Notes" });
  const fastHeading = screen.getByRole("heading", { name: "Notes" });
  for (let r = 0; r < rounds; r++) {
    await timeAsync("assert vitest expect.element", 200, () =>
      expect.element(vitestHeading).toBeInTheDocument(),
    );
    await timeAsync("assert vitest findElement", 200, () => vitestHeading.findElement());
    await timeAsync("assert fast expect.element", 200, () =>
      expect.element(fastHeading).toBeInTheDocument(),
    );
    await timeAsync("assert fast findElement", 200, () => fastHeading.findElement());
    await timeAsync("assert fast findElement+expect", 200, async () =>
      expect(await fastHeading.findElement()).toBeTruthy(),
    );
  }

  progress("assertions");
  // 3. Actions on /notes/new.
  await renderServer({ url: "/notes/new" });
  await expect.element(page.getByLabelText("Title")).toBeInTheDocument();
  benchQueries(
    [
      label("Title"),
      label("Content"),
      text("0 / 2000"),
      role("button", "Create note"),
      role("textbox", "Title"),
    ],
    200,
  );
  progress("queries /notes/new");

  const ue = userEvent.setup({ delay: null });
  const heading = document.querySelector("h1")!;
  const counter = [...document.querySelectorAll("span")].find((s) =>
    s.textContent?.endsWith("/ 2000"),
  )!;
  const titleLabel = document.querySelector("label[for=title]")!;
  const title = document.querySelector<HTMLInputElement>("#title")!;
  const content = document.querySelector<HTMLTextAreaElement>("#content")!;
  const targets = [heading, counter];
  // The events each sends, once.
  const seen: string[] = [];
  const types = [
    "pointerover",
    "pointerenter",
    "mouseover",
    "mouseenter",
    "pointermove",
    "mousemove",
    "pointerdown",
    "mousedown",
    "focus",
    "focusin",
    "blur",
    "focusout",
    "pointerup",
    "mouseup",
    "click",
    "select",
    "beforeinput",
    "input",
    "paste",
    "change",
    "keydown",
    "keyup",
  ];
  const log = (event: Event) =>
    seen.push(`${event.type}@${(event.target as Element).localName ?? "doc"}`);
  for (const type of types) document.addEventListener(type, log, true);
  for (const [name, act] of [
    ["user.click label", () => ue.click(titleLabel)],
    ["click label", () => click(titleLabel)],
    ["user.click heading", () => ue.click(heading)],
    ["click heading", () => click(heading)],
    [
      "user clear+paste",
      async () => {
        await ue.clear(content);
        await ue.paste("Hello");
      },
    ],
    ["fill", () => fill(content, "Hello")],
    ["focus away", () => click(heading)],
  ] as const) {
    seen.length = 0;
    await act();
    notes[`events ${name}`] = seen.join(" ");
  }
  for (const type of types) document.removeEventListener(type, log, true);
  notes["counter after fill"] = counter.textContent;

  for (let r = 0; r < rounds; r++) {
    await timeAsync("action user.click (2 targets)", 100, (i) => ue.click(targets[i % 2]!));
    await timeAsync("action user.pointer no move (2 targets)", 100, (i) =>
      ue.pointer([{ keys: "[MouseLeft]", target: targets[i % 2]! }]),
    );
    await timeAsync("action click (2 targets)", 100, (i) => click(targets[i % 2]!));
    await timeAsync("action user.click label", 100, (i) => ue.click(i % 2 ? titleLabel : heading));
    await timeAsync("action click label", 100, (i) => click(i % 2 ? titleLabel : heading));
    await timeAsync("action user clear+paste", 100, async (i) => {
      await ue.clear(title);
      await ue.paste(i % 2 ? "Groceries" : "Ideas");
    });
    await timeAsync("action fill", 100, (i) => fill(title, i % 2 ? "Groceries" : "Ideas"));
    await timeAsync("action user clear+paste textarea", 100, async (i) => {
      await ue.clear(content);
      await ue.paste(i % 2 ? "Oat milk" : "Bread");
    });
    await timeAsync("action fill textarea", 100, (i) =>
      fill(content, i % 2 ? "Oat milk" : "Bread"),
    );
  }

  progress("actions");
  // 4. Waits: a Server Action that navigates, and a validation error that
  // renders in place. Query counts and latency from the commit that brings
  // the element to the test going on.
  const locatorProto = Object.getPrototypeOf(page.getByText("")) as { elements(): Element[] };
  const originalElements = locatorProto.elements;
  let vitestQueries = 0;
  locatorProto.elements = function (this: unknown) {
    vitestQueries++;
    return originalElements.call(this);
  };
  type Wait = { queries: number; latency: number; total: number };
  const waits: Record<string, Wait[]> = {};
  async function measureWait(
    name: string,
    present: () => boolean,
    wait: () => Promise<unknown>,
    act: () => Promise<void>,
  ) {
    let appeared = 0;
    const observer = new MutationObserver(() => {
      if (!appeared && present()) appeared = performance.now();
    });
    observer.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    const q0 = vitestQueries + stats.waitQueries + stats.queries;
    const start = performance.now();
    await act();
    await wait();
    const end = performance.now();
    observer.disconnect();
    (waits[name] ??= []).push({
      queries: vitestQueries + stats.waitQueries + stats.queries - q0,
      latency: appeared ? end - appeared : -1,
      total: end - start,
    });
  }
  const h1Is = (t: string) => () =>
    [...document.querySelectorAll("h1")].some((h) => h.textContent === t);
  const errorShown = () => document.querySelector("#title-error") !== null;
  for (let r = 0; r < 6; r++) {
    for (const variant of ["vitest", "fast"] as const) {
      await renderServer({ url: "/notes/new" });
      await expect.element(page.getByLabelText("Title")).toBeInTheDocument();
      // Empty title: the error renders in place.
      await measureWait(
        `${variant} validation error`,
        errorShown,
        () =>
          variant === "vitest"
            ? expect.element(page.getByText("Title is required.")).toBeInTheDocument()
            : expect.element(screen.getByText("Title is required.")).toBeInTheDocument(),
        () => click(screen.getByRole("button", { name: "Create note" })),
      );
      await fill(screen.getByLabelText("Title"), `Groceries ${r}`);
      await measureWait(
        `${variant} action+navigation`,
        h1Is(`Groceries ${r}`),
        () =>
          variant === "vitest"
            ? expect
                .element(page.getByRole("heading", { name: `Groceries ${r}` }))
                .toBeInTheDocument()
            : expect
                .element(screen.getByRole("heading", { name: `Groceries ${r}` }))
                .toBeInTheDocument(),
        () => click(screen.getByRole("button", { name: "Create note" })),
      );
      // A link: a navigation of the client.
      await measureWait(
        `${variant} link navigation`,
        h1Is("Notes"),
        () =>
          variant === "vitest"
            ? expect.element(page.getByRole("heading", { name: "Notes" })).toBeInTheDocument()
            : expect.element(screen.getByRole("heading", { name: "Notes" })).toBeInTheDocument(),
        () => click(screen.getByRole("link", { name: "All notes" })),
      );
    }
  }
  locatorProto.elements = originalElements;
  progress("waits");
  const summary: Record<string, unknown> = {};
  for (const [name, values] of Object.entries(results))
    summary[name] = Math.round(median(values) * 10) / 10;
  const waitSummary: Record<string, unknown> = {};
  for (const [name, list] of Object.entries(waits)) {
    waitSummary[name] = {
      queries: median(list.map((w) => w.queries)),
      queriesAll: list.map((w) => w.queries),
      latencyMs: Math.round(median(list.map((w) => w.latency)) * 1000) / 1000,
      latencyAll: list.map((w) => Math.round(w.latency * 100) / 100),
      totalMs: Math.round(median(list.map((w) => w.total)) * 100) / 100,
    };
  }
  console.log("FASTDOM-MICRO " + JSON.stringify({ summary, waits: waitSummary, notes, stats }));
});
