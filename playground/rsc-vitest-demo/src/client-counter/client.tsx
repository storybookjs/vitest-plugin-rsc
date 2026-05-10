"use client";

import React from "react";

export function ClientCounter(): React.ReactElement {
  const [count, setCount] = React.useState(0);
  return <button onClick={() => setCount((c) => c + 1)}>client-counter: {count}</button>;
}
