import Link from "next/link";
import { Tag } from "host-package/ui";
import type { ReactNode } from "react";
import { Badge } from "../app/components/badge.tsx";
import { Late } from "../app/components/late.tsx";
import {
  Awaits,
  Counter,
  Forwarded,
  Item,
  Klass,
  Memoed,
  ToneProvider,
} from "../app/components/reference-box.tsx";

// JSX of the rsc layer with client references in it, as a story with a
// decorator of the host is: the host renders it with the React of the
// browser layer, see host/render-references.tsx. The functions here are
// server code, which that React calls as components.

/** A Server Component around the tree, as a decorator of the host is. */
function Decorator({ children }: { children?: ReactNode }) {
  return <section data-testid="decorator">{children}</section>;
}

/** A Server Component that makes the element of a reference as it renders. */
function MakesLate() {
  return <Late />;
}

export function tree(
  promise: Promise<string>,
  ref: (element: HTMLElement | null) => void,
  order: string[],
): ReactNode {
  return (
    <Decorator>
      <ToneProvider tone="dark">
        <Counter label="first" />
        <Counter label="second" />
        <ul>
          {order.map((name) => (
            <Item key={name} name={name} />
          ))}
        </ul>
        <Awaits promise={promise} />
        <Memoed text="memo" />
        <Forwarded text="forwarded" ref={ref} />
        <Klass text="class" />
        <Tag>tag</Tag>
        <Badge />
        <Link href="/elsewhere" data-testid="link">
          a link
        </Link>
        <MakesLate />
      </ToneProvider>
    </Decorator>
  );
}

/** Server code that calls a reference as a function, which only renders. */
export function callsReference(): unknown {
  return (Counter as unknown as (props: object) => unknown)({ label: "called" });
}
