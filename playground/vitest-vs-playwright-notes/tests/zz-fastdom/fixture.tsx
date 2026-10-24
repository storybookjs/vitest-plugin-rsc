"use client";

import Form from "next/form";
import Link from "next/link";
import { useState, type SyntheticEvent } from "react";

// What tests/zz-fastdom/fidelity.test.tsx clicks and fills: React's handlers
// of each kind, which write what they saw to `window.fidelityLog`.

const log = (entry: string) => {
  ((window as { fidelityLog?: string[] }).fidelityLog ??= []).push(entry);
};
const handlers = (name: string) => ({
  onFocus: () => log(`focus ${name}`),
  onBlur: () => log(`blur ${name}`),
  onMouseEnter: () => log(`mouseenter ${name}`),
  onMouseLeave: () => log(`mouseleave ${name}`),
  onPointerEnter: () => log(`pointerenter ${name}`),
  onMouseDown: (event: { button: number; buttons: number; detail: number }) =>
    log(`mousedown ${name} button=${event.button} buttons=${event.buttons} detail=${event.detail}`),
  onMouseUp: (event: { button: number; buttons: number; detail: number }) =>
    log(`mouseup ${name} button=${event.button} buttons=${event.buttons} detail=${event.detail}`),
  onClick: (event: { button: number; buttons: number; detail: number }) =>
    log(`click ${name} button=${event.button} buttons=${event.buttons} detail=${event.detail}`),
  onKeyDown: (event: { key: string }) => log(`keydown ${name} ${event.key}`),
  onKeyUp: (event: { key: string }) => log(`keyup ${name} ${event.key}`),
  onBeforeInput: () => log(`beforeinput ${name}`),
  onInput: () => log(`input ${name}`),
});

export function Fixture() {
  const [value, setValue] = useState("");
  const [checked, setChecked] = useState(false);
  const [length, setLength] = useState(0);
  return (
    <div>
      <p>
        <label htmlFor="controlled">Controlled</label>
        <input
          id="controlled"
          value={value}
          {...handlers("controlled")}
          onChange={(event) => {
            setValue(event.target.value);
            log(`change controlled ${event.target.value}`);
          }}
        />
        <span>Value: {value}</span>
      </p>
      <p>
        <label htmlFor="uncontrolled">Uncontrolled</label>
        <textarea
          id="uncontrolled"
          defaultValue=""
          {...handlers("uncontrolled")}
          onChange={(event) => {
            setLength(event.target.value.length);
            log(`change uncontrolled ${event.target.value}`);
          }}
        />
        <span>{length} characters</span>
      </p>
      <p>
        <label>
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => {
              setChecked(event.target.checked);
              log(`change checkbox ${event.target.checked}`);
            }}
          />{" "}
          Check
        </label>
      </p>
      <form
        onSubmit={(event: SyntheticEvent<HTMLFormElement>) => {
          event.preventDefault();
          log(`submit ${String(new FormData(event.currentTarget).get("q"))}`);
        }}
      >
        <label htmlFor="q">Query</label>
        <input id="q" name="q" {...handlers("q")} />
        <button type="submit">Go</button>
      </form>
      <button type="button" {...handlers("press")}>
        Press
      </button>
      <Link href="/sign-in" {...handlers("link")}>
        Sign in link
      </Link>
      <Form action="/sign-up">
        <label htmlFor="form-email">Form email</label>
        <input id="form-email" name="email" />
        <button type="submit">Open sign-up</button>
      </Form>
    </div>
  );
}
