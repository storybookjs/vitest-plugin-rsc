import { expect, screen, waitFor } from "./fast-dom.ts";

// expectTitles() of test/vitest.ts, on the queries of test/fast-dom.ts.

/** The titles of the list of notes, in order. */
export async function expectTitles(titles: string[]): Promise<void> {
  const links = screen.getByRole("list", { name: "Notes" }).getByRole("link");
  await waitFor(() => expect(links.elements().map((link) => link.textContent)).toEqual(titles));
}
