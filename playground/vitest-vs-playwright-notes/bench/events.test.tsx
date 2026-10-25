import { userEvent } from "@testing-library/user-event";
import { page as domPage } from "dom-locators";
import { beforeEach, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, fill } from "#test/user-event.ts";
import { buttonNamed, hasHeading, linkTo, seedApp, setValue } from "./app.ts";
import { EventFixture } from "./fixture.tsx";
import { measure, nextRequest, serverIdle, untilDom } from "./harness.ts";

// An event, per kind, until the DOM shows the state it set: the same event
// four ways. `test helper` is test/user-event.ts as tests/vitest-user-event/
// uses it, which first waits for the element with `locator.findElement()`;
// `user-event` is Testing Library's user-event on the element (as the
// helper sets it up, without delays); `dom` dispatches a prebuilt event, or
// sets the value with the native setter and dispatches `input`; `playwright`
// is the locator's own action, which Playwright carries out from Node. And
// `dom-locators`, the action of its locator, in the page.

const user = userEvent.setup({ delay: null });
const iterations = 100;
const warmup = 5;
const runs = iterations + warmup;

const state = (name: string) => document.querySelector(`[data-state="${name}"]`)!.textContent;
const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const prebuilt = <T extends Event>(make: () => T) => Array.from({ length: runs }, make);

beforeEach(async () => {
  await renderServer(<EventFixture />);
});

test("click on a button that sets state", async () => {
  const button = () => buttonNamed("Increment");
  const counted = (before: string | null) => untilDom(() => state("count") !== before);
  const locator = page.getByRole("button", { name: "Increment" });
  await measure("Event › click a button (setState) › test helper", async () => {
    const before = state("count");
    await click(locator);
    await counted(before);
  });
  await measure("Event › click a button (setState) › user-event", async () => {
    const before = state("count");
    await user.click(button());
    await counted(before);
  });
  const clicks = prebuilt(() => new MouseEvent("click", { bubbles: true, cancelable: true }));
  await measure("Event › click a button (setState) › dom", async ({ i }) => {
    const before = state("count");
    button().dispatchEvent(clicks[i]!);
    await counted(before);
  });
  await measure("Event › click a button (setState) › playwright", async () => {
    const before = state("count");
    await locator.click();
    await counted(before);
  });
  const ours = domPage.getByRole("button", { name: "Increment" });
  await measure("Event › click a button (setState) › dom-locators", async () => {
    const before = state("count");
    await ours.click();
    await counted(before);
  });
});

test("fill of a controlled input", async () => {
  const input = () => byId<HTMLInputElement>("text");
  const filled = (text: string) =>
    untilDom(() => input().value === text && state("length") === `${text.length} / 2000`);
  const locator = page.getByLabelText("Text");
  const textOf = (i: number) => `text ${i}`;
  await measure("Event › fill an input › test helper", async ({ i }) => {
    await fill(locator, textOf(i));
    await filled(textOf(i));
  });
  await measure("Event › fill an input › user-event", async ({ i }) => {
    await user.clear(input());
    await user.paste(textOf(i));
    await filled(textOf(i));
  });
  const inputs = prebuilt(() => new InputEvent("input", { bubbles: true }));
  await measure("Event › fill an input › dom", async ({ i }) => {
    setValue(input(), textOf(i));
    input().dispatchEvent(inputs[i]!);
    await filled(textOf(i));
  });
  await measure("Event › fill an input › playwright", async ({ i }) => {
    await locator.fill(textOf(i));
    await filled(textOf(i));
  });
  const ours = domPage.getByLabelText("Text");
  await measure("Event › fill an input › dom-locators", async ({ i }) => {
    await ours.fill(textOf(i));
    await filled(textOf(i));
  });
});

test("type one key", async () => {
  const input = () => byId<HTMLInputElement>("text");
  const empty = prebuilt(() => new InputEvent("input", { bubbles: true }));
  const cleared = () => untilDom(() => state("length") === "0 / 2000");
  const typed = () => untilDom(() => state("length") === "1 / 2000");
  await measure(
    "Event › type one key › user-event",
    async () => {
      await user.keyboard("x");
      await typed();
    },
    {
      // By user-event too, which keeps its own value of the field.
      before: async () => {
        await user.clear(input());
        await cleared();
      },
    },
  );
  const downs = prebuilt(() => new KeyboardEvent("keydown", { key: "x", bubbles: true }));
  const inputs = prebuilt(
    () => new InputEvent("input", { bubbles: true, data: "x", inputType: "insertText" }),
  );
  const ups = prebuilt(() => new KeyboardEvent("keyup", { key: "x", bubbles: true }));
  await measure(
    "Event › type one key › dom",
    async ({ i }) => {
      input().dispatchEvent(downs[i]!);
      setValue(input(), "x");
      input().dispatchEvent(inputs[i]!);
      input().dispatchEvent(ups[i]!);
      await typed();
    },
    {
      before: async (i) => {
        setValue(input(), "");
        input().dispatchEvent(empty[i]!);
        input().focus();
        await cleared();
      },
    },
  );
});

test("Enter submits a form", async () => {
  const input = () => byId<HTMLInputElement>("query");
  const submitted = (before: string | null) => untilDom(() => state("submits") !== before);
  await measure(
    "Event › Enter submits a form › user-event",
    async () => {
      const before = state("submits");
      await user.keyboard("{Enter}");
      await submitted(before);
    },
    { before: () => input().focus() },
  );
  await measure("Event › Enter submits a form › dom (requestSubmit)", async () => {
    const before = state("submits");
    input().form!.requestSubmit();
    await submitted(before);
  });
});

test("select an option", async () => {
  const select = () => byId<HTMLSelectElement>("choice");
  const valueOf = (i: number) => (i % 2 ? "a" : "b");
  const selected = (value: string) => untilDom(() => state("choice") === value);
  await measure("Event › select an option › user-event", async ({ i }) => {
    await user.selectOptions(select(), valueOf(i));
    await selected(valueOf(i));
  });
  const changes = prebuilt(() => new Event("change", { bubbles: true }));
  await measure("Event › select an option › dom", async ({ i }) => {
    select().value = valueOf(i);
    select().dispatchEvent(changes[i]!);
    await selected(valueOf(i));
  });
});

test("toggle a checkbox", async () => {
  const checkbox = () => byId<HTMLInputElement>("done");
  const toggled = (before: string | null) => untilDom(() => state("done") !== before);
  await measure("Event › toggle a checkbox › user-event", async () => {
    const before = state("done");
    await user.click(checkbox());
    await toggled(before);
  });
  const clicks = prebuilt(() => new MouseEvent("click", { bubbles: true, cancelable: true }));
  await measure("Event › toggle a checkbox › dom", async ({ i }) => {
    const before = state("done");
    checkbox().dispatchEvent(clicks[i]!);
    await toggled(before);
  });
});

test("hover", async () => {
  const target = () => document.querySelector<HTMLElement>("[data-hover]")!;
  const hovered = (value: string) => untilDom(() => state("hovered") === value);
  await measure(
    "Event › hover (pointer moves onto an element) › user-event",
    async () => {
      await user.hover(target());
      await hovered("true");
    },
    {
      after: async () => {
        await user.unhover(target());
        await hovered("false");
      },
    },
  );
  const overs = prebuilt(
    () => new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body }),
  );
  const outs = prebuilt(
    () => new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }),
  );
  await measure(
    "Event › hover (pointer moves onto an element) › dom (mouseover)",
    async ({ i }) => {
      target().dispatchEvent(overs[i]!);
      await hovered("true");
    },
    {
      after: async (i) => {
        target().dispatchEvent(outs[i]!);
        await hovered("false");
      },
    },
  );
});

test("focus and blur", async () => {
  const before = async () => {
    byId("first").focus();
    await untilDom(() => state("focused") === "first");
  };
  const moved = () => untilDom(() => state("focused") === "second");
  await measure(
    "Event › focus moves to the next input › user-event (tab)",
    async () => {
      await user.tab();
      await moved();
    },
    { before },
  );
  await measure(
    "Event › focus moves to the next input › dom (focus())",
    async () => {
      byId("second").focus();
      await moved();
    },
    { before },
  );
});

test("click on a link, until the navigation's request reaches the server", async () => {
  const { notes } = await seedApp();
  await renderServer({ url: "/notes" });
  await serverIdle();
  const note = notes[0]!;
  const href = `/notes/${note.id}`;
  const back = async () => {
    await untilDom(() => hasHeading(note.title));
    linkTo("/notes").click();
    await untilDom(() => hasHeading("Notes"));
    await serverIdle();
  };
  const queuedAfter = async (start: number, act: () => unknown) => {
    const request = nextRequest();
    await act();
    return { total: (await request).queued - start };
  };
  const locator = page.getByRole("link", { name: note.title, exact: true });
  await measure(
    "Event › click a link, until its request is queued › test helper",
    ({ start }) => queuedAfter(start, () => click(locator)),
    { after: back },
  );
  await measure(
    "Event › click a link, until its request is queued › user-event",
    ({ start }) => queuedAfter(start, () => user.click(linkTo(href))),
    { after: back },
  );
  const clicks = prebuilt(
    () => new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
  );
  await measure(
    "Event › click a link, until its request is queued › dom",
    ({ start, i }) => queuedAfter(start, () => linkTo(href).dispatchEvent(clicks[i]!)),
    { after: back },
  );
  await measure(
    "Event › click a link, until its request is queued › playwright",
    ({ start }) => queuedAfter(start, () => locator.click()),
    { after: back },
  );
});
