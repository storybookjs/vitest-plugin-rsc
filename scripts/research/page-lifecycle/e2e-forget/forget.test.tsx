// Experiment N: a node of a page that was left keeps none of React's
// properties, so a node that outlives its page does not keep the page.
import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { expect, test } from "vitest";
import { page } from "vitest/browser";

const reactKeys = (node: Node | null | undefined) =>
  node ? Object.keys(node).filter((key) => /^_+react/.test(key)) : [];

const router = () =>
  (window as unknown as { next: { router: { push(href: string): void } } }).next.router;

test("after a page load", async () => {
  await renderServer({ url: "/" });
  const heading = document.querySelector("h1")!;
  const text = heading.firstChild;
  expect(reactKeys(heading).length).toBeGreaterThan(0);

  await cleanup();

  console.log(`PLM ${JSON.stringify({ heading: reactKeys(heading), text: reactKeys(text) })}`);
});

test("after a client navigation", async () => {
  await renderServer({ url: "/" });
  router().push("/images");
  await expect.element(page.getByRole("heading", { name: "Images" })).toBeInTheDocument();
  const heading = document.querySelector("h1")!;
  const image = document.querySelector("img")!;

  await renderServer({ url: "/" });

  console.log(
    `PLM ${JSON.stringify({ connected: heading.isConnected, heading: reactKeys(heading), image: reactKeys(image) })}`,
  );
});
