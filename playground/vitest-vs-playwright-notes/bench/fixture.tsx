"use client";

import { useState } from "react";

// What the events of bench/events.test.tsx act on, each with its state in an
// `<output>`: the notes app has no select, checkbox or hover of its own.
export function EventFixture() {
  const [count, setCount] = useState(0);
  const [text, setText] = useState("");
  const [submits, setSubmits] = useState(0);
  const [choice, setChoice] = useState("a");
  const [done, setDone] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState("none");
  return (
    <section>
      <h1>Events</h1>
      <p>
        <button type="button" onClick={() => setCount((value) => value + 1)}>
          Increment
        </button>
        <output data-state="count">{count}</output>
      </p>
      <p>
        <label htmlFor="text">Text</label>
        <input id="text" value={text} onChange={(event) => setText(event.target.value)} />
        <output data-state="length">{text.length} / 2000</output>
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSubmits((value) => value + 1);
        }}
      >
        <label htmlFor="query">Query</label>
        <input id="query" name="query" />
        <output data-state="submits">{submits}</output>
      </form>
      <p>
        <label htmlFor="choice">Choice</label>
        <select id="choice" value={choice} onChange={(event) => setChoice(event.target.value)}>
          <option value="a">A</option>
          <option value="b">B</option>
        </select>
        <output data-state="choice">{choice}</output>
      </p>
      <p>
        <input
          id="done"
          type="checkbox"
          checked={done}
          onChange={(event) => setDone(event.target.checked)}
        />
        <label htmlFor="done">Done</label>
        <output data-state="done">{String(done)}</output>
      </p>
      <p>
        <span
          data-hover
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          Hover target
        </span>
        <output data-state="hovered">{String(hovered)}</output>
      </p>
      <p>
        <label htmlFor="first">First</label>
        <input id="first" onFocus={() => setFocused("first")} onBlur={() => setFocused("none")} />
        <label htmlFor="second">Second</label>
        <input id="second" onFocus={() => setFocused("second")} onBlur={() => setFocused("none")} />
        <output data-state="focused">{focused}</output>
      </p>
    </section>
  );
}
