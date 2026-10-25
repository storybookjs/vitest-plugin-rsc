// The actions in a DOM of Node.js, happy-dom's or jsdom's, where no
// browser's log holds them: the events of the mouse's options and of the
// keyboard's combinations, what the keys do to the caret, and the files of
// an upload.

import { beforeEach, expect, test } from "vitest";
import { page } from "../../src/index.ts";

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
    "contextmenu@button button=2 detail=1",
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

test("trial checks and does not act, force acts on what is hidden", async () => {
  await page.getByRole("button", { name: "Save" }).click({ trial: true });
  expect(log).toEqual([]);
  (document.querySelector("button") as HTMLElement).style.display = "none";
  await page.getByText("Save").click({ force: true, timeout: 0 });
  expect(log).toContain("click@button button=0 detail=1");
  await expect(page.getByText("Save").click({ timeout: 0 })).rejects.toThrow(/is not visible/);
});

test("the arrows, Home and End move the caret, with Shift its selection", async () => {
  const name = page.getByLabelText("Name");
  await name.fill("abc");
  for (const key of ["ArrowLeft", "x", "Home", "y", "Shift+ArrowRight", "z", "End", "w"]) {
    await name.press(key);
  }
  expect(name.element()).toHaveProperty("value", "yzbxcw");
});

test("select all, a capital with Shift, and typing a text", async () => {
  const name = page.getByLabelText("Name");
  await name.fill("Ada");
  const isMac = /Mac/.test(navigator.platform);
  await name.press(isMac ? "Meta+a" : "Control+a");
  await name.press("Shift+b");
  expect(name.element()).toHaveProperty("value", "B");
  await name.pressSequentially(" and é+1");
  expect(name.element()).toHaveProperty("value", "B and é+1");
  expect(keysDown).toEqual([
    isMac ? "Meta" : "Control",
    "a",
    "Shift",
    "B",
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
