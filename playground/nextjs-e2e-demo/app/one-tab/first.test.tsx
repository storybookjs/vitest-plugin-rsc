import { expect, test } from "vitest";
import { loadClientModule } from "vitest-plugin-rsc/nextjs/testing-library";
import { linkedStylesheets } from "../../test/browser.ts";
import * as rendering from "../../vitest.render.tsx";
import { ClientCard } from "../styles/client-card.tsx";

// JSX of the rsc layer with a client reference, which the React of the
// browser layer renders in the tab: see vitest.render.tsx. second.test.tsx
// is the same. `fileParallelism: false` of the project runs the two in one
// tab, one after the other, in an order of Vitest's: before the second, the
// plugin's setup file takes the stylesheets of the first, which the
// reference links again as it renders.

// The files of this project that ran in the tab before.
const before = ((globalThis as { oneTabFiles?: string[] }).oneTabFiles ??= []);
const card = "client-card.module.css";

test("renders a client reference with the tab's React, with its CSS", async () => {
  const { renderInTab } = await loadClientModule(rendering);
  if (before.length > 0)
    expect(linkedStylesheets()).not.toContainEqual(expect.stringContaining(card));

  const { getByText } = await renderInTab(<ClientCard />);

  // At once: the reference had loaded, with its CSS, as render() resolved.
  const element = getByText("Styled by a CSS module in a Client Component").element();
  expect(getComputedStyle(element).color).toBe("rgb(128, 0, 0)");
  expect(linkedStylesheets()).toContainEqual(expect.stringContaining(card));
  before.push(import.meta.url);
});
