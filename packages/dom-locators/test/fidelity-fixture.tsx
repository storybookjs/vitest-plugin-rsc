// The fixture of the fidelity test: React's handlers on a button, a link, a
// controlled input, a textarea, a checkbox with its label, a select, a form
// with an action of `useActionState`, a file input, a button that cancels
// its `pointerdown`, a read-only input, a number input and a box that
// scrolls, each writing to the log.

import { useActionState, useState } from "react";

/** What happened, in order: a React handler as `react:onClick@id`, a native event as `click@id`. */
export const log: string[] = [];

const write = (entry: string) => log.push(entry);
const on = (name: string) => (event: { currentTarget: Element }) =>
  write(`react:${name}@${event.currentTarget.id}`);

const handlers = (...names: string[]) => Object.fromEntries(names.map((name) => [name, on(name)]));

const pointer = handlers(
  "onClick",
  "onDoubleClick",
  "onContextMenu",
  "onAuxClick",
  "onMouseEnter",
  "onMouseLeave",
  "onMouseDown",
  "onMouseUp",
  "onPointerEnter",
  "onPointerLeave",
  "onPointerDown",
  "onPointerUp",
  "onFocus",
  "onBlur",
);

export function Fixture() {
  const [text, setText] = useState("old");
  const [checked, setChecked] = useState(false);
  const [fruit, setFruit] = useState("apple");
  const [state, action] = useActionState(async (_previous: string, data: FormData) => {
    write(`action:${String(data.get("name"))}`);
    return `sent ${String(data.get("name"))}`;
  }, "");
  return (
    <div id="fixture">
      <button id="button" type="button" {...pointer}>
        <span id="button-label">Save</span>
      </button>
      <button id="other" type="button" {...pointer}>
        Other
      </button>
      <a
        id="link"
        href="#target"
        {...pointer}
        onClick={(event) => {
          event.preventDefault();
          write("react:onClick@link");
        }}
      >
        Go
      </a>
      <label htmlFor="text">Text</label>
      <input
        id="text"
        value={text}
        maxLength={8}
        onChange={(event) => {
          write(`react:onChange@text=${event.target.value}`);
          setText(event.target.value);
        }}
        {...handlers("onFocus", "onBlur", "onKeyDown", "onKeyUp", "onSelect")}
      />
      <label htmlFor="notes">Notes</label>
      <textarea
        id="notes"
        defaultValue=""
        onChange={(event) => write(`react:onChange@notes=${event.target.value}`)}
        {...handlers("onFocus", "onBlur")}
      />
      <input
        id="check"
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          write(`react:onChange@check=${event.target.checked}`);
          setChecked(event.target.checked);
        }}
        {...handlers("onClick", "onFocus")}
      />
      <label id="check-label" htmlFor="check" {...handlers("onClick")}>
        Agree
      </label>
      <label htmlFor="fruit">Fruit</label>
      <select
        id="fruit"
        value={fruit}
        onChange={(event) => {
          write(`react:onChange@fruit=${event.target.value}`);
          setFruit(event.target.value);
        }}
        {...handlers("onFocus")}
      >
        <option value="apple">Apple</option>
        <option value="pear">Pear</option>
      </select>
      <form id="form" action={action} {...handlers("onSubmit")}>
        <label htmlFor="name">Name</label>
        <input id="name" name="name" defaultValue="" {...handlers("onKeyDown", "onFocus")} />
        <button id="send" type="submit" {...handlers("onClick")}>
          Send
        </button>
      </form>
      <output id="result">{state}</output>
      <label htmlFor="file">File</label>
      <input
        id="file"
        type="file"
        multiple
        onChange={(event) =>
          write(
            `react:onChange@file=${[...event.target.files!].map((file) => file.name).join(",")}`,
          )
        }
        {...handlers("onInput")}
      />
      <button id="hold" type="button" onPointerDown={(event) => event.preventDefault()}>
        Hold
      </button>
      <label htmlFor="locked">Locked</label>
      <input id="locked" readOnly defaultValue="fixed" {...handlers("onKeyDown")} />
      <label htmlFor="amount">Amount</label>
      <input
        id="amount"
        type="number"
        defaultValue=""
        onChange={(event) => write(`react:onChange@amount=${event.target.value}`)}
      />
      <div
        id="scroller"
        style={{ height: 40, overflow: "auto" }}
        {...handlers("onWheel", "onScroll")}
      >
        <p id="scrolled" style={{ height: 200, margin: 0 }}>
          Scroll me
        </p>
      </div>
    </div>
  );
}

// The native events the log has, on every element, in the capture phase.
export const nativeEvents = [
  "pointerover",
  "pointerenter",
  "pointerout",
  "pointerleave",
  "pointermove",
  "pointerdown",
  "pointerup",
  "mouseover",
  "mouseenter",
  "mouseout",
  "mouseleave",
  "mousemove",
  "mousedown",
  "mouseup",
  "click",
  "auxclick",
  "contextmenu",
  "dblclick",
  "wheel",
  "scroll",
  "focus",
  "blur",
  "focusin",
  "focusout",
  "keydown",
  "keypress",
  "keyup",
  "beforeinput",
  "input",
  "change",
  "select",
  "submit",
];

/** A native event as the log has it: its type, its target, and what tells it from another of its type. */
export function nativeEntry(event: Event): string {
  const target = event.target as Element | Document;
  const id = target instanceof Element ? target.id || target.localName : "document";
  let detail = "";
  if (event instanceof MouseEvent) {
    detail = ` button=${event.button} buttons=${event.buttons} detail=${event.detail}`;
    if (event instanceof PointerEvent) detail += ` pointerType=${event.pointerType}`;
    const related = event.relatedTarget as Element | null;
    if (/over|out|enter|leave/.test(event.type))
      detail += ` related=${related?.id || related?.localName || null}`;
    if (event instanceof WheelEvent) detail += ` deltaX=${event.deltaX} deltaY=${event.deltaY}`;
  } else if (event instanceof InputEvent) {
    detail = ` ${event.inputType} ${JSON.stringify(event.data)}`;
  } else if (event instanceof KeyboardEvent) {
    detail = ` key=${JSON.stringify(event.key)} code=${event.code} keyCode=${event.keyCode}`;
  }
  const held = (["alt", "ctrl", "meta", "shift"] as const).filter(
    (key) => (event as Partial<MouseEvent>)[`${key}Key`],
  );
  if (held.length) detail += ` ${held.join("+")}`;
  return `${event.type}@${id}${detail}`;
}
