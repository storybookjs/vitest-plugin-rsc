"use client";

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { evaluation } from "../app/components/reference-box.tsx";

// What renders JSX of the rsc layer in the host's document, as the renderer
// of a framework does: with the React of the browser layer. Two ways, as a
// renderer of stories does them. With `act`, it renders inside React's
// `act()` with `IS_REACT_ACT_ENVIRONMENT` on, and resolves when `act()` does.
// Without, it resolves once the tree has committed, from a layout effect
// around it. Then the host looks at what is in the document at once, as a
// `play` function or a test does next. With `strict`, in React's
// `StrictMode`.

/** The evaluation of reference-box.tsx that this file imported. */
export const directEvaluation = evaluation;

const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

function WithCallback({ callback, children }: { callback: () => void; children: React.ReactNode }) {
  React.useLayoutEffect(callback, [callback]);
  return children;
}

export type RenderOptions = { act: boolean; strict?: boolean };

export async function render(
  node: React.ReactNode,
  container: Element,
  { act, strict = false }: RenderOptions,
): Promise<{ rerender(node: React.ReactNode): Promise<void>; caught: string[] }> {
  // What an error boundary caught, which React would log with `console.error`.
  const caught: string[] = [];
  const root: Root = createRoot(container, {
    onCaughtError: (error) => caught.push(error instanceof Error ? error.message : String(error)),
  });
  const wrapped = (node: React.ReactNode) =>
    strict ? <React.StrictMode>{node}</React.StrictMode> : node;
  const renderOnce = async (node: React.ReactNode) => {
    if (act) {
      const previous = scope.IS_REACT_ACT_ENVIRONMENT;
      scope.IS_REACT_ACT_ENVIRONMENT = true;
      try {
        await React.act(async () => {
          root.render(wrapped(node));
        });
      } finally {
        scope.IS_REACT_ACT_ENVIRONMENT = previous;
      }
      return;
    }
    await new Promise<void>((resolve) =>
      root.render(<WithCallback callback={resolve}>{wrapped(node)}</WithCallback>),
    );
  };
  await renderOnce(node);
  return { rerender: renderOnce, caught };
}
