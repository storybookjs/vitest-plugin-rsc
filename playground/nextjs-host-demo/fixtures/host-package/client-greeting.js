"use client";

// A file of the host with "use client", like the module of a Storybook
// framework that renders a client story: code of the browser layer.
import { createElement, useState } from "react";
import { hostState } from "./host-state.js";

export function PackageGreeting({ name }) {
  const [count, setCount] = useState(0);
  return createElement(
    "button",
    { type: "button", onClick: () => setCount(count + 1) },
    `${hostState.greeting} ${name} from a package: ${count}`,
  );
}
