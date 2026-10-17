"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { buildOf } from "../lib/build.ts";

// The build of React, and of the Flight client that read `element` from the
// payload of the server, in the ssr layer and in the browser layer. The span
// keeps what the server rendered, which React leaves as it is when it
// hydrates.
export function ClientReactBuild({ element }: { element: ReactElement }) {
  const paragraph = useRef<HTMLParagraphElement>(null);
  const [inBrowser, setInBrowser] = useState<string>();
  useEffect(() => {
    // React DOM's development build keeps on a fiber who rendered it.
    const [, fiber] = Object.entries(paragraph.current!).find(([key]) =>
      key.startsWith("__reactFiber$"),
    )!;
    const reactDom = "_debugOwner" in fiber ? "development" : "production";
    setInBrowser(
      `React ${buildOf(<i />)}, React DOM ${reactDom}, Flight client ${buildOf(element)}`,
    );
  }, [element]);
  return (
    <p ref={paragraph}>
      Server:{" "}
      <span suppressHydrationWarning>
        React {buildOf(<i />)}, Flight client {buildOf(element)}
      </span>
      {inBrowser && `. Browser: ${inBrowser}`}
    </p>
  );
}

const here = () => (typeof window === "undefined" ? "server" : "browser");

// Renders another text on the server than in the browser.
export function Mismatch() {
  return <p>Rendered on the {here()}</p>;
}

// Throws once it is clicked, as it renders in the browser.
export function BreaksOnClick() {
  const [broken, setBroken] = useState(false);
  if (broken) throw new Error("Broken Client Component");
  return <button onClick={() => setBroken(true)}>Break</button>;
}

// Throws as it renders on the server, and renders in the browser.
export function BreaksOnServer() {
  if (typeof window === "undefined") throw new Error("Broken on the server");
  return <p>Rendered in the browser</p>;
}
