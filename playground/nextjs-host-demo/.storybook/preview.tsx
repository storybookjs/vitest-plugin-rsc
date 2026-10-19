import type { Decorator, Preview } from "@storybook/nextjs-vite-rsc";
import { cookies } from "next/headers";
import { useId } from "react";
import "server-only";
import { useArgs, useGlobals, useParameter } from "storybook/preview-api";
import { ThemeProvider } from "../app/components/theme.tsx";
import { Blockquote } from "./docs-components.tsx";
import "./preview.css";

// The preview file is server code, evaluated once, on the server, as a
// layout of the app is: it can import `server-only`. Its decorators decorate
// every story. In a client story the browser renders what they return, a
// Client Component like `ThemeProvider` among it; a server story renders it
// in its request.

// Storybook's hooks, which a decorator has in either kind of story.
const withStorybookHooks: Decorator = (Story) => {
  const [args] = useArgs();
  const [globals] = useGlobals();
  const fileName = useParameter<string>("fileName");
  return (
    <div
      data-testid="storybook-hooks"
      data-args={Object.keys(args).sort().join(" ")}
      data-locale={globals.locale}
      data-file={fileName?.split("/").at(-1)}
    >
      <Story />
    </div>
  );
};

// What a decorator of the preview file can do in a server story only, for
// the stories whose parameter asks for it: be async, and read the request.
const withVisitor: Decorator = (Story, { parameters }) =>
  parameters.visitor ? aroundVisitor(Story) : <Story />;

async function aroundVisitor(Story: Parameters<Decorator>[0]) {
  const visitor = (await cookies()).get("visitor")?.value ?? "none";
  return (
    <div data-testid="visitor" data-visitor={visitor}>
      <Story />
    </div>
  );
}

// And a hook of React, which a component of a file with "use client" has.
const withReactHook: Decorator = (Story, { parameters }) => {
  if (!parameters.reactHook) return <Story />;
  return (
    <div id={useId()}>
      <Story />
    </div>
  );
};

export default {
  decorators: [
    withVisitor,
    withReactHook,
    withStorybookHooks,
    (Story) => (
      <ThemeProvider theme="storybook">
        <Story />
      </ThemeProvider>
    ),
  ],
  initialGlobals: { locale: "en" },
  // What renders the elements of an MDX file, on top of the docs page's own.
  parameters: { docs: { components: { blockquote: Blockquote } } },
} satisfies Preview;
