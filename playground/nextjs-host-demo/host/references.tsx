import Link from "next/link";
import { Tag } from "host-package/ui";
import type { ReactNode } from "react";
import { Added } from "../app/components/added.tsx";
import { Badge } from "../app/components/badge.tsx";
import { Broken } from "../app/components/broken.tsx";
import { Late } from "../app/components/late.tsx";
import {
  Awaits,
  Boundary,
  Counter,
  Forwarded,
  Item,
  Klass,
  Memoed,
  ToneProvider,
} from "../app/components/reference-box.tsx";
import { Accent, TabPanel, Tabs, shout } from "../app/components/tabs.tsx";

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

/**
 * The tree. `added` is what a second render of the host adds, as Storybook
 * renders a story again with other args: a reference whose file nothing
 * loaded before.
 */
export function tree(
  promise: Promise<string>,
  ref: (element: HTMLElement | null) => void,
  order: string[],
  added = false,
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
        {/* Browser code sees the exports, as with Flight: a context as a
            type and as a value, the type of a child with its static, and a
            function. */}
        <Accent value="bold">
          <Tabs context={Accent} format={shout}>
            <TabPanel label="one" />
            <TabPanel label="two" />
          </Tabs>
        </Accent>
        {added && <Added />}
      </ToneProvider>
    </Decorator>
  );
}

/** A reference whose file fails to load, inside an error boundary. */
export function failingTree(): ReactNode {
  return (
    <Boundary>
      <Counter label="next to the boundary" />
      <Broken />
    </Boundary>
  );
}

/** Server code that calls a reference as a function, which only renders. */
export function callsReference(): unknown {
  return (Counter as unknown as (props: object) => unknown)({ label: "called" });
}
