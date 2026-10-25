import { expect, test } from "vitest";
import { page } from "dom-locators";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { sessionCount, storedUser } from "#test/db.ts";

// Signs up, writes notes, signs out and signs back in, and finds them.
// Variants 25 to 49 are in flow-account-2.test.tsx.
for (let i = 0; i < 25; i++) {
  const person = {
    name: `Writer ${i}`,
    email: `writer${i}@example.com`,
    password: `password ${i}`,
  };
  const titles = Array.from({ length: (i % 3) + 1 }, (_, k) => `Writer ${i}, note ${k}`);
  test(`signs up, writes ${titles.length} notes and comes back, variant ${i}`, async () => {
    await renderServer({ url: "/sign-up" });

    await page.getByLabelText("Name").fill(person.name);
    await page.getByLabelText("Email").fill(person.email);
    await page.getByLabelText("Password").fill(person.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect.element(page.getByText(`Welcome, ${person.name}!`)).toBeInTheDocument();
    for (const title of titles) {
      await page.getByRole("link", { name: "New note" }).click();
      await page.getByLabelText("Title").fill(title);
      await page.getByRole("button", { name: "Create note" }).click();
      await expect.element(page.getByText("Note created.")).toBeInTheDocument();
      await page.getByRole("link", { name: "All notes" }).click();
    }
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByLabelText("Email").fill(person.email);
    await page.getByLabelText("Password").fill(person.password);
    await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

    await expect.element(page.getByText(`Signed in as ${person.name}`)).toBeInTheDocument();
    await expect
      .element(
        page.getByText(titles.length === 1 ? "1 note" : `${titles.length} notes`, { exact: true }),
      )
      .toBeInTheDocument();
    expect(await sessionCount()).toBe(1);
    expect((await storedUser(person.email))?.name).toBe(person.name);
  });
}
