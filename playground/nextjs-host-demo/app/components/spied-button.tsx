"use client";

import { useState } from "react";
import { fn } from "storybook/test";

// Stands in for the mock of a module of the app in Storybook, which a Client
// Component imports: in the browser layer, a spy of `storybook/test` is the
// preview's own module, also in a static build.
const pressed = fn();

export function SpiedButton() {
  const [calls, setCalls] = useState(0);
  return (
    <button
      type="button"
      onClick={() => {
        pressed();
        setCalls(pressed.mock.calls.length);
      }}
    >
      Spied presses: {calls}
    </button>
  );
}
