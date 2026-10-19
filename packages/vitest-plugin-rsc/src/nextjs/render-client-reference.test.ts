import * as React from "react";
import { renderToString } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { createRenderClientReference, type LoadReference } from "./render-client-reference.ts";
import { fulfilled, track, type Thenable } from "./thenable.ts";

// The renderer of client references with React's development build, which
// renders on the server here: every file is loaded already, so nothing
// suspends. The references are the proxies of client-proxy.ts, which hand
// rendering to the renderer, with React's tag and `$$id`.

const h = React.createElement;

/** The files of the browser layer, by their reference keys. */
const files: Record<string, Record<string, unknown>> = {};
const failed = new Map<string, Thenable<Record<string, unknown>>>();
const loads: string[] = [];
// The same thenable for a key, as the tab's graph has it.
const loaded = new Map<string, Thenable<Record<string, unknown>>>();
const load: LoadReference = (key) => {
  loads.push(key);
  if (!loaded.has(key)) loaded.set(key, fulfilled(files[key]!));
  return failed.get(key) ?? loaded.get(key)!;
};
let render = createRenderClientReference(load);

afterEach(() => {
  failed.clear();
  loads.length = 0;
  render = createRenderClientReference(load);
  vi.restoreAllMocks();
});

/** The client reference of an export, as the rsc layer has it. */
function reference(key: string, name: string): React.FunctionComponent<any> {
  const proxy = (props: object) => render(key, name, props) as React.ReactNode;
  return Object.defineProperties(proxy, {
    $$typeof: { value: Symbol.for("react.client.reference") },
    $$id: { value: `${key}#${name}` },
  });
}

// A file of the browser layer with components that read what they get as
// browser code does: the types of their children, a static of a type, a
// context, a function to call.
const Tone = React.createContext("none");
function TabPanel({ children }: { children?: React.ReactNode }) {
  return h("section", null, children);
}
TabPanel.muiName = "TabPanel";
const upper = (text: string) => text.toUpperCase();
function Tabs({
  children,
  context,
  format,
}: {
  children?: React.ReactNode;
  context?: React.Context<string>;
  format?: (text: string) => string;
}) {
  const tone = React.use(context ?? Tone);
  const kinds = React.Children.map(children, (child) =>
    React.isValidElement(child)
      ? `${child.type === TabPanel}:${(child.type as { muiName?: string }).muiName}`
      : "text",
  );
  return h(
    "div",
    null,
    `${tone} ${format?.("tabs") ?? "tabs"} ${kinds?.join(",") ?? ""}`,
    children,
  );
}
const received: object[] = [];
function Probe(props: object) {
  received.push(props);
  return null;
}
function Shows(props: { children?: React.ReactNode }) {
  received.push(props);
  return props.children;
}
files["/tabs.tsx"] = { Tabs, TabPanel, Tone, upper, Probe, Shows };

const ref = {
  Tabs: reference("/tabs.tsx", "Tabs"),
  TabPanel: reference("/tabs.tsx", "TabPanel"),
  Tone: reference("/tabs.tsx", "Tone"),
  upper: reference("/tabs.tsx", "upper"),
  Probe: reference("/tabs.tsx", "Probe"),
  Shows: reference("/tabs.tsx", "Shows"),
};

test("renders the export, with every reference in its props as the export", () => {
  const html = renderToString(
    h(
      ref.Tone,
      { value: "dark" },
      h(ref.Tabs, { format: ref.upper }, h(ref.TabPanel, null, "a"), h(ref.TabPanel, null, "b")),
      h(ref.Tabs, { context: ref.Tone }),
    ),
  );

  // A context as a type and as a value, the type of a child, its static,
  // and a function that browser code calls.
  expect(html).toBe(
    "<div>dark TABS true:TabPanel,true:TabPanel<section>a</section><section>b</section></div>" +
      "<div>dark tabs </div>",
  );
});

test("leaves the element of a Server Component as it is, as Flight renders it first", () => {
  function Server({ children }: { children?: React.ReactNode }) {
    return h("article", null, children);
  }

  const html = renderToString(h(ref.Tabs, null, h(Server, null, h(ref.TabPanel, null, "a"))));

  expect(html).toBe("<div>none tabs false:undefined<article><section>a</section></article></div>");
  // The reference in its props loaded with the tree, before the Server
  // Component made it.
  expect(new Set(loads)).toEqual(new Set(["/tabs.tsx"]));
});

test("keeps keys and refs, and gives the same props for the same props", () => {
  const error = vi.spyOn(console, "error");
  const ref1 = React.createRef<HTMLElement>();
  const list = ["a", "b"].map((name) => h(ref.TabPanel, { key: name }, name));
  const tree = h(ref.Shows, null, list, h(ref.TabPanel, { ref: ref1 }), h("i", null, "c"));

  renderToString(tree);
  renderToString(tree);

  const [first, second] = received.splice(0) as { children: React.ReactElement[] }[];
  const [items, withRef, plain] = first!.children as unknown as [
    React.ReactElement[],
    React.ReactElement<{ ref: unknown }>,
    React.ReactElement,
  ];
  expect(items.map((item) => [item.type, item.key])).toEqual([
    [TabPanel, "a"],
    [TabPanel, "b"],
  ]);
  expect(withRef.type).toBe(TabPanel);
  expect(withRef.props.ref).toBe(ref1);
  // An element without a reference in it is the one the server made.
  expect(plain).toBe((tree.props as { children: unknown[] }).children[2]);
  // The second render gets what the first did, for a `memo` that compares.
  expect(second!.children).toBe(first!.children);
  // React checked the static children of the proxy for keys as they were
  // made: not again as they are the export's.
  expect(error).not.toHaveBeenCalled();
});

test("leaves a reference whose file failed to load, which throws where it renders", () => {
  files["/broken.tsx"] = {};
  const rejected = track(Promise.reject(new Error("broken.tsx failed to load")));
  rejected.status = "rejected";
  rejected.reason = new Error("broken.tsx failed to load");
  failed.set("/broken.tsx", rejected as Thenable<Record<string, unknown>>);
  const Broken = reference("/broken.tsx", "Broken");
  const tree = h(ref.Probe, null, h(Broken));

  renderToString(tree);
  expect(() => renderToString(h(Broken))).toThrow("broken.tsx failed to load");

  // The Probe of a file that loaded renders, with the reference as it was.
  const [props] = received.splice(0) as { children: React.ReactElement }[];
  expect(props!.children.type).toBe(Broken);
});

test("stops at a cycle and after as many objects as it looks at", () => {
  const cyclic: Record<string, unknown> = { tone: ref.Tone };
  cyclic.self = cyclic;
  const many = Array.from({ length: 3000 }, () => ({ format: ref.upper }));

  renderToString(h(ref.Probe, { cyclic, many }));

  const [props] = received.splice(0) as { cyclic: typeof cyclic; many: typeof many }[];
  expect(props!.cyclic.tone).toBe(Tone);
  expect(props!.many[0]!.format).toBe(upper);
  expect(props!.many.at(-1)!.format).toBe(ref.upper);
});

test("throws where server code calls it, outside a render", () => {
  expect(() => render("/tabs.tsx", "Tabs", {})).toThrow(
    "/tabs.tsx#Tabs is a Client Component and cannot be called on the server",
  );
});

test("throws for an export that the file does not have in the browser layer", () => {
  expect(() => renderToString(h(reference("/tabs.tsx", "Gone")))).toThrow(
    'vitest-plugin-rsc: /tabs.tsx has no export "Gone" in the browser layer.',
  );
});
