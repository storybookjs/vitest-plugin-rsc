import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, fill } from "#test/user-event.ts";
import { sessionCount, storedUser } from "#test/db.ts";

// Signs up, writes notes, signs out and signs back in, and finds them.
for (let i = 0; i < 50; i++) {
  const person = {
    name: `Writer ${i}`,
    email: `writer${i}@example.com`,
    password: `password ${i}`,
  };
  const titles = Array.from({ length: (i % 3) + 1 }, (_, k) => `Writer ${i}, note ${k}`);
  test(`signs up, writes ${titles.length} notes and comes back, variant ${i}`, async () => {
    await renderServer({ url: "/sign-up" });

    await fill(page.getByLabelText("Name"), person.name);
    await fill(page.getByLabelText("Email"), person.email);
    await fill(page.getByLabelText("Password"), person.password);
    await click(page.getByRole("button", { name: "Create account" }));
    await expect.element(page.getByText(`Welcome, ${person.name}!`)).toBeInTheDocument();
    for (const title of titles) {
      await click(page.getByRole("link", { name: "New note" }));
      await fill(page.getByLabelText("Title"), title);
      await click(page.getByRole("button", { name: "Create note" }));
      await expect.element(page.getByText("Note created.")).toBeInTheDocument();
      await click(page.getByRole("link", { name: "All notes" }));
    }
    await click(page.getByRole("button", { name: "Sign out" }));
    await fill(page.getByLabelText("Email"), person.email);
    await fill(page.getByLabelText("Password"), person.password);
    await click(page.getByRole("main").getByRole("button", { name: "Sign in" }));

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
