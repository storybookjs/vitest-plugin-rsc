// The actions in a DOM of Node.js, happy-dom's or jsdom's, where no
// browser's log holds them: the events of the mouse's options and of the
// keyboard's combinations, what the keys do to the caret, and the files of
// an upload.

import { beforeEach, expect, test } from "vitest";
import { page, UnsupportedError } from "../../src/index.ts";

const log: string[] = [];
const keysDown: string[] = [];
const types = ["keydown", "keyup", "mousedown", "mouseup", "click", "auxclick", "contextmenu"];
const types2 = ["dblclick", "wheel", "input", "change"];

beforeEach(() => {
  document.body.innerHTML = `
    <button>Save</button>
    <input aria-label="Name">
    <label>File <input type="file" multiple></label>`;
  log.length = 0;
  keysDown.length = 0;
  for (const type of [...types, ...types2]) {
    document.addEventListener(type, record, true);
  }
});

function record(event: Event) {
  const held = (["alt", "ctrl", "meta", "shift"] as const).filter(
    (key) => (event as Partial<MouseEvent>)[`${key}Key`],
  );
  const target = event.target as Element;
  let entry = `${event.type}@${target.localName}`;
  if ("button" in event) entry += ` button=${String(event.button)}`;
  if ("detail" in event && event.type !== "keydown" && event.type !== "keyup") {
    entry += ` detail=${String(event.detail)}`;
  }
  if (event instanceof KeyboardEvent) entry += ` ${event.key}`;
  if (event instanceof KeyboardEvent && event.type === "keydown") keysDown.push(event.key);
  if (held.length) entry += ` ${held.join("+")}`;
  log.push(entry);
}

test("a click with a modifier holds it down around the click", async () => {
  await page.getByRole("button", { name: "Save" }).click({ modifiers: ["Shift"] });
  expect(log).toEqual([
    "keydown@body Shift shift",
    "mousedown@button button=0 detail=1 shift",
    "mouseup@button button=0 detail=1 shift",
    "click@button button=0 detail=1 shift",
    // The click focused the button.
    "keyup@button Shift",
  ]);
});

test("a right click has its contextmenu and an auxclick, a triple click one dblclick", async () => {
  await page.getByRole("button", { name: "Save" }).click({ button: "right" });
  expect(log).toEqual([
    "mousedown@button button=2 detail=1",
    "contextmenu@button button=2 detail=0",
    "mouseup@button button=2 detail=1",
    "auxclick@button button=2 detail=1",
  ]);
  log.length = 0;
  await page.getByRole("button", { name: "Save" }).tripleClick();
  expect(log.filter((entry) => /click/.test(entry))).toEqual([
    "click@button button=0 detail=1",
    "click@button button=0 detail=2",
    "dblclick@button button=0 detail=2",
    "click@button button=0 detail=3",
  ]);
});

test("trial checks and does not act; force acts at once, and throws for what is hidden", async () => {
  await page.getByRole("button", { name: "Save" }).click({ trial: true });
  expect(log).toEqual([]);
  await page.getByRole("button", { name: "Save" }).click({ force: true });
  expect(log).toContain("click@button button=0 detail=1");
  (document.querySelector("button") as HTMLElement).style.display = "none";
  await expect(page.getByText("Save").click({ force: true })).rejects.toThrow(UnsupportedError);
  await expect(page.getByText("Save").click({ timeout: 1 })).rejects.toThrow(/is not visible/);
});

test("the arrows, Home and End move the caret, with Shift its selection", async () => {
  const name = page.getByLabelText("Name");
  await name.fill("abc");
  for (const key of ["ArrowLeft", "x", "Home", "y", "Shift+ArrowRight", "z", "End", "w"]) {
    await name.press(key);
  }
  expect(name.element()).toHaveProperty("value", "yzbxcw");
});

test("select all, a letter with Shift, and typing a text", async () => {
  const name = page.getByLabelText("Name");
  await name.fill("Ada");
  const isMac = /Mac/.test(navigator.platform);
  await name.press(isMac ? "Meta+a" : "Control+a");
  // A letter is itself with Shift held, as Playwright's keyboard has it.
  await name.press("Shift+b");
  expect(name.element()).toHaveProperty("value", "b");
  await name.pressSequentially(" and é+1");
  expect(name.element()).toHaveProperty("value", "b and é+1");
  expect(keysDown).toEqual([
    isMac ? "Meta" : "Control",
    "a",
    "Shift",
    "b",
    " ",
    "a",
    "n",
    "d",
    " ",
    "+",
    "1",
  ]);
});

test("Shift+Tab moves the focus back", async () => {
  await page.getByLabelText("Name").press("Shift+Tab");
  expect(document.activeElement).toBe(document.querySelector("button"));
});

test("upload sets the files of the label's input, with input and change", async (context) => {
  if (typeof DataTransfer !== "function") {
    await expect(page.getByLabelText("File").upload(new File(["a"], "a.txt"))).rejects.toThrow(
      /without DataTransfer/,
    );
    return context.skip();
  }
  const files = [new File(["a"], "a.txt"), new File(["b"], "b.txt")];
  await page.getByLabelText("File").upload(files);
  const input = document.querySelector<HTMLInputElement>("input[type=file]")!;
  expect([...input.files!].map((file) => file.name)).toEqual(["a.txt", "b.txt"]);
  expect(log).toEqual(["input@input", "change@input"]);
});

test("wheel turns the wheel over the element", async () => {
  await page.getByRole("button", { name: "Save" }).wheel({ direction: "down", times: 2 });
  expect(log.map((entry) => entry.split(" ")[0])).toEqual(["wheel@button", "wheel@button"]);
});

test("dropTo presses on the element, moves onto the target, lets go there, and clicks what has both", async () => {
  document.body.innerHTML = "<main><button>From</button><p>To</p></main>";
  log.length = 0;
  await page.getByRole("button").dropTo(page.getByText("To"));
  expect(log).toEqual([
    "mousedown@button button=0 detail=1",
    "mouseup@p button=0 detail=1",
    "click@main button=0 detail=1",
  ]);
});

test("a key throws before any event for what the package does not model", async () => {
  const name = page.getByLabelText("Name");
  await name.fill("hello world");
  log.length = 0;
  for (const key of ["Control+Backspace", "Control+ArrowLeft", "Control+Tab", "Control+b"]) {
    await expect(name.press(key)).rejects.toThrow(UnsupportedError);
  }
  await expect(page.getByRole("button", { name: "Save" }).press("Control+c")).rejects.toThrow(
    UnsupportedError,
  );
  expect(log).toEqual([]);
});

test("a number input takes the keys of a number it keeps, and throws for a part of one", async () => {
  document.body.innerHTML = '<input type="number" aria-label="Amount">';
  const amount = page.getByLabelText("Amount");
  await amount.pressSequentially("12");
  expect(amount.element()).toHaveProperty("value", "12");
  // happy-dom keeps any value of a number input; Chrome and jsdom drop a part of a number.
  const probe = document.createElement("input");
  probe.type = "number";
  probe.value = "12-";
  if (probe.value === "12-") return;
  await expect(amount.press("-")).rejects.toThrow(UnsupportedError);
  expect(amount.element()).toHaveProperty("value", "12");
});

test("the caret of a textarea stays where it was when the focus comes back; Home of a first empty line", async () => {
  document.body.innerHTML = '<textarea aria-label="Notes"></textarea><button>Other</button>';
  const notes = page.getByLabelText("Notes");
  await notes.fill("xyz");
  await page.getByRole("button").click();
  await notes.pressSequentially("abc");
  expect(notes.element()).toHaveProperty("value", "xyzabc");
  await notes.fill("\nab");
  const area = notes.element() as HTMLTextAreaElement;
  area.setSelectionRange(0, 0);
  await notes.press("Home");
  expect(area.selectionStart).toBe(0);
});

test("an arrow moves over a character as it is seen", async () => {
  document.body.innerHTML = '<input aria-label="Name">';
  const name = page.getByLabelText("Name");
  await name.fill("a👍🏽b");
  await name.press("ArrowLeft");
  await name.press("ArrowLeft");
  await name.press("x");
  expect(name.element()).toHaveProperty("value", "ax👍🏽b");
});

test("a character without a key goes into no read-only control", async () => {
  document.body.innerHTML = '<input aria-label="Name" value="x" readonly>';
  await page.getByLabelText("Name").pressSequentially("é");
  expect(page.getByLabelText("Name").element()).toHaveProperty("value", "x");
});

test("dropTo looks for the target once the button is down", async () => {
  document.body.innerHTML = "<main><button>From</button></main>";
  document.querySelector("button")!.addEventListener("pointerdown", () => {
    document.querySelector("main")!.insertAdjacentHTML("beforeend", "<p>To</p>");
  });
  log.length = 0;
  await page.getByRole("button").dropTo(page.getByText("To"), { timeout: 100 });
  expect(log.at(-1)).toBe("click@main button=0 detail=1");
});

test("no mousemove after a cancelled pointerdown, until the release", async () => {
  document.body.innerHTML = "<main><button>From</button><p>To</p></main>";
  document.querySelector("button")!.addEventListener("pointerdown", (event) => {
    event.preventDefault();
  });
  const moves: string[] = [];
  document.addEventListener("mousemove", (event) =>
    moves.push((event.target as Element).localName),
  );
  await page.getByRole("button").dropTo(page.getByText("To"));
  expect(moves).toEqual(["button"]);
  expect(log).not.toContain("mousedown@button button=0 detail=1");
});

test("wheel throws for a direction it has not", async () => {
  const direction = "toString" as "up";
  await expect(page.getByRole("button", { name: "Save" }).wheel({ direction })).rejects.toThrow(
    /invalid direction/,
  );
});

test("Backspace and Delete take a character as it is seen", async () => {
  document.body.innerHTML = '<input aria-label="Name">';
  const name = page.getByLabelText("Name");
  await name.fill("hi😀");
  await name.press("Backspace");
  expect(name.element()).toHaveProperty("value", "hi");
  await name.fill("😀x");
  await name.press("Home");
  await name.press("Delete");
  expect(name.element()).toHaveProperty("value", "x");
});

test("a read-only input has the beforeinput of a typed character alone", async () => {
  document.body.innerHTML = '<input aria-label="Locked" value="fixed" readonly>';
  const inputs: string[] = [];
  document.addEventListener("beforeinput", (event) => inputs.push((event as InputEvent).inputType));
  await page.getByLabelText("Locked").press("x");
  await page.getByLabelText("Locked").press("Backspace");
  expect(inputs).toEqual(["insertText"]);
  expect(page.getByLabelText("Locked").element()).toHaveProperty("value", "fixed");
});

test("pressSequentially throws before the focus for what it does not model", async () => {
  document.body.innerHTML =
    '<div contenteditable="true" aria-label="Rich">x</div><input type="email" aria-label="Email">';
  const focused: string[] = [];
  document.addEventListener("focusin", (event) =>
    focused.push((event.target as Element).localName),
  );
  await expect(page.getByLabelText("Rich").pressSequentially("hi")).rejects.toThrow(
    UnsupportedError,
  );
  const probe = document.createElement("input");
  probe.type = "email";
  probe.value = " a";
  if (probe.value === " a") return;
  // The space before a letter, which an email input drops as it is set.
  await expect(page.getByLabelText("Email").pressSequentially(" a")).rejects.toThrow(
    UnsupportedError,
  );
  expect(focused).toEqual([]);
});

test("select all outside a text control throws", async () => {
  const isMac = /Mac/.test(navigator.platform);
  await expect(
    page.getByRole("button", { name: "Save" }).press(isMac ? "Meta+a" : "Control+a"),
  ).rejects.toThrow(UnsupportedError);
});

test("the keys of press() go to what has the focus, when the element takes none", async () => {
  document.body.innerHTML = '<input aria-label="Name"><p>Text</p>';
  await page.getByLabelText("Name").fill("a");
  const targets: string[] = [];
  document.addEventListener("keydown", (event) =>
    targets.push((event.target as Element).localName),
  );
  await page.getByText("Text").press("b");
  // happy-dom's `focus()` focuses any element, a paragraph too.
  if (navigator.userAgent.includes("HappyDOM")) return expect(targets).toEqual(["p"]);
  expect(targets).toEqual(["input"]);
  expect(page.getByLabelText("Name").element()).toHaveProperty("value", "ab");
});

test("the checks of enabled and editable look at the button or the label's control an element is in", async () => {
  document.body.innerHTML = `
    <button disabled><span>Send</span></button>
    <label>Agree <input type="checkbox" disabled></label>
    <label>Title <input readonly></label>`;
  await expect(page.getByText("Send").click({ timeout: 1 })).rejects.toThrow(/is disabled/);
  await expect(page.getByText("Agree").click({ timeout: 1 })).rejects.toThrow(/is disabled/);
  await expect(page.getByText("Title").fill("x", { timeout: 1 })).rejects.toThrow(
    /is not editable/,
  );
  (document.querySelector("button") as HTMLButtonElement).disabled = false;
  await page.getByText("Send").click({ timeout: 1 });
  expect(log).toContain("click@span button=0 detail=1");
});

test("a timeout of 0 is no limit for an action, as Playwright's", async () => {
  document.body.innerHTML = "";
  const click = page.getByRole("button", { name: "Late" }).click({ timeout: 0 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  document.body.innerHTML = "<button>Late</button>";
  await click;
  expect(log).toContain("click@button button=0 detail=1");
});

test("a timeout longer than a timer's waits", async () => {
  document.body.innerHTML = "";
  const found = page.getByText("Later").findElement({ timeout: Infinity });
  await new Promise((resolve) => setTimeout(resolve, 20));
  document.body.innerHTML = "<p>Later</p>";
  expect(await found).toBe(document.querySelector("p"));
});

test("unhover moves the mouse onto the body without a look at its locator", async () => {
  await page.getByText("Nothing like it").unhover();
  document.body.innerHTML = "<p>Two</p><p>Two</p>";
  await page.getByText("Two").unhover();
});

test("an option the package does not model throws UnsupportedError", async () => {
  // @ts-expect-error Playwright's option, which the page does not model.
  await expect(page.getByText("Save").click({ delay: 1 })).rejects.toThrow(UnsupportedError);
  // @ts-expect-error not an option of findElement().
  expect(() => page.getByText("Save").findElement({ state: "visible" })).toThrow(UnsupportedError);
  // @ts-expect-error not an option of filter().
  expect(() => page.getByText("Save").filter({ visible: true })).toThrow(UnsupportedError);
});

test("Tab passes over the controls of a disabled fieldset", async (context) => {
  document.body.innerHTML = `
    <input aria-label="First">
    <fieldset disabled><input aria-label="Off"></fieldset>
    <input aria-label="Last">`;
  // happy-dom's `:disabled` leaves out the controls of a disabled fieldset.
  if (!document.querySelector('[aria-label="Off"]')!.matches(":disabled")) return context.skip();
  await page.getByLabelText("First").press("Tab");
  expect(document.activeElement).toBe(document.querySelector('[aria-label="Last"]'));
});

test("a key with an effect of Chrome's the package does not model throws before any event", async () => {
  document.body.innerHTML = `
    <form>
      <input type="radio" name="size" aria-label="Small">
      <input type="checkbox" aria-label="Agree">
      <details><summary>More</summary></details>
      <input type="search" aria-label="Search" value="notes">
    </form>`;
  log.length = 0;
  await expect(page.getByLabelText("Agree").press("Tab")).rejects.toThrow(UnsupportedError);
  await expect(page.getByLabelText("Agree").press("Enter")).rejects.toThrow(UnsupportedError);
  await expect(page.getByText("More").press("Enter")).rejects.toThrow(UnsupportedError);
  await expect(page.getByLabelText("Search").press("Escape")).rejects.toThrow(UnsupportedError);
  document.body.insertAdjacentHTML("beforeend", "<dialog open><button>Close</button></dialog>");
  await expect(page.getByText("Close").press("Escape")).rejects.toThrow(UnsupportedError);
  expect(log.filter((entry) => entry.startsWith("key"))).toEqual([]);
});

test("Enter submits by the form's first submit button, an image's too", async () => {
  document.body.innerHTML = `
    <form><input aria-label="Name"><input type="image" alt="Go"><button>Later</button></form>`;
  await page.getByLabelText("Name").press("Enter");
  expect(log.filter((entry) => entry.startsWith("click@"))).toEqual([
    "click@input button=0 detail=0",
  ]);
});

test("Enter in a textarea breaks the line, with no data", async () => {
  document.body.innerHTML = '<textarea aria-label="Notes"></textarea>';
  const data: (string | null)[] = [];
  const area = document.querySelector("textarea")!;
  for (const type of ["beforeinput", "input"]) {
    area.addEventListener(type, (event) => data.push((event as InputEvent).data));
  }
  await page.getByLabelText("Notes").press("Enter");
  expect(area.value).toBe("\n");
  // happy-dom's `InputEvent` has "" for no data.
  const none = new InputEvent("input", { data: null }).data;
  expect(data).toEqual([none, none]);
});

test("Space clicks a button after its keyup, unless the keyup is cancelled", async () => {
  const button = document.querySelector("button")!;
  button.addEventListener("keyup", (event) => event.preventDefault(), { once: true });
  await page.getByRole("button", { name: "Save" }).press(" ");
  expect(log.filter((entry) => entry.startsWith("click"))).toEqual([]);
  await page.getByRole("button", { name: "Save" }).press(" ");
  expect(log.filter((entry) => entry.startsWith("click"))).toHaveLength(1);
});
