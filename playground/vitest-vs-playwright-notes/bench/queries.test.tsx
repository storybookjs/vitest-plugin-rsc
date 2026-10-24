import { getByLabelText, getByRole, getByText } from "@testing-library/dom";
import { test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { seedApp } from "./app.ts";
import { measure } from "./harness.ts";

// One query of the /notes page with 20 notes: Vitest's locators, by their
// selector engine (Playwright's injected script, in the page), and Testing
// Library's queries, which user-event brings into the page.

test("queries of the /notes page", async () => {
  await seedApp();
  await renderServer({ url: "/notes" });
  const body = document.body;
  // Each a fraction of a millisecond: 10 calls an iteration.
  const batch = { batch: 10 };
  const check = (found: unknown[]) => {
    if (found.length !== 1) throw new Error(`Found ${found.length} elements`);
  };
  await measure(
    "Query › page.getByRole('link', { name }).elements()",
    () => check(page.getByRole("link", { name: "Note 07", exact: true }).elements()),
    batch,
  );
  await measure(
    "Query › page.getByLabelText('Search').elements()",
    () => check(page.getByLabelText("Search").elements()),
    batch,
  );
  await measure(
    "Query › page.getByText('20 notes').elements()",
    () => check(page.getByText("20 notes").elements()),
    batch,
  );
  await measure(
    "Query › @testing-library/dom getByRole('link', { name })",
    () => check([getByRole(body, "link", { name: "Note 07" })]),
    batch,
  );
  await measure(
    "Query › @testing-library/dom getByLabelText('Search')",
    () => check([getByLabelText(body, "Search")]),
    batch,
  );
  await measure(
    "Query › @testing-library/dom getByText('20 notes')",
    () => check([getByText(body, "20 notes")]),
    batch,
  );
});
