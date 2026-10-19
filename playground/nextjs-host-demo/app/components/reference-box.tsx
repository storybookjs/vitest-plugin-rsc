"use client";

import {
  Component,
  Suspense,
  createContext,
  forwardRef,
  memo,
  use,
  useContext,
  useId,
  useState,
  type ReactNode,
} from "react";

// Client Components of the app with state, context, `use()`, `memo`,
// `forwardRef` and a class, which the host renders as client references from
// JSX of the rsc layer: see host/references.tsx.

/** Which evaluation of this file rendered: the host compares it with its own import. */
export const evaluation = Math.random().toString(36).slice(2);

const Tone = createContext("none");

export function ToneProvider({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <Tone value={tone}>
      <div data-testid="tone" data-tone={tone} data-evaluation={evaluation}>
        {children}
      </div>
    </Tone>
  );
}

export function Counter({ label }: { label: string }) {
  const [count, setCount] = useState(0);
  const id = useId();
  const tone = useContext(Tone);
  return (
    <button id={id} data-testid={`counter-${label}`} onClick={() => setCount(count + 1)}>
      {label} {tone} {count}
    </button>
  );
}

export function Item({ name }: { name: string }) {
  const [count, setCount] = useState(0);
  return (
    <li data-testid="item" onClick={() => setCount(count + 1)}>
      {name}:{count}
    </li>
  );
}

function Value({ promise }: { promise: Promise<string> }) {
  return <span data-testid="value">{use(promise)}</span>;
}

export function Awaits({ promise }: { promise: Promise<string> }) {
  return (
    <Suspense fallback={<span data-testid="value-fallback">waiting</span>}>
      <Value promise={promise} />
    </Suspense>
  );
}

export const Memoed = memo(function Memoed({ text }: { text: string }) {
  return <i data-testid="memoed">{text}</i>;
});

export const Forwarded = forwardRef<HTMLElement, { text: string }>(function Forwarded(
  { text },
  ref,
) {
  return (
    <em ref={ref} data-testid="forwarded">
      {text}
    </em>
  );
});

export class Klass extends Component<{ text: string }> {
  render() {
    return <u data-testid="klass">{this.props.text}</u>;
  }
}
