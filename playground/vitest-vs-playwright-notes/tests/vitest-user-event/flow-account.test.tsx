import { test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, expect, fill, screen } from "#test/fast-dom.ts";
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

    await fill(screen.getByLabelText("Name"), person.name);
    await fill(screen.getByLabelText("Email"), person.email);
    await fill(screen.getByLabelText("Password"), person.password);
    await click(screen.getByRole("button", { name: "Create account" }));
    await expect.element(screen.getByText(`Welcome, ${person.name}!`)).toBeInTheDocument();
    for (const title of titles) {
      await click(screen.getByRole("link", { name: "New note" }));
      await fill(screen.getByLabelText("Title"), title);
      await click(screen.getByRole("button", { name: "Create note" }));
      await expect.element(screen.getByText("Note created.")).toBeInTheDocument();
      await click(screen.getByRole("link", { name: "All notes" }));
    }
    await click(screen.getByRole("button", { name: "Sign out" }));
    await fill(screen.getByLabelText("Email"), person.email);
    await fill(screen.getByLabelText("Password"), person.password);
    await click(screen.getByRole("main").getByRole("button", { name: "Sign in" }));

    await expect.element(screen.getByText(`Signed in as ${person.name}`)).toBeInTheDocument();
    await expect
      .element(screen.getByText(titles.length === 1 ? "1 note" : `${titles.length} notes`))
      .toBeInTheDocument();
    expect(await sessionCount()).toBe(1);
    expect((await storedUser(person.email))?.name).toBe(person.name);
  });
}
