import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, fill } from "#test/user-event.ts";
import { sessionCount, storedUser } from "#test/db.ts";
import { person } from "#test/people.ts";

// Signs up, writes notes, signs out and signs back in, and finds them.
for (let i = 0; i < 50; i++) {
  const titles = Array.from({ length: (i % 3) + 1 }, (_, k) => `Writer ${i}, note ${k}`);
  test(`signs up, writes ${titles.length} notes and comes back, variant ${i}`, async () => {
    const writer = person({
      name: `Writer ${i}`,
      email: `writer${i}@example.com`,
      password: `password ${i}`,
    });
    await renderServer({ url: "/sign-up" });

    await fill(page.getByLabelText("Name"), writer.name);
    await fill(page.getByLabelText("Email"), writer.email);
    await fill(page.getByLabelText("Password"), writer.password);
    await click(page.getByRole("button", { name: "Create account" }));
    await expect.element(page.getByText(`Welcome, ${writer.name}!`)).toBeInTheDocument();
    for (const title of titles) {
      await click(page.getByRole("link", { name: "New note" }));
      await fill(page.getByLabelText("Title"), title);
      await click(page.getByRole("button", { name: "Create note" }));
      await expect.element(page.getByText("Note created.")).toBeInTheDocument();
      await click(page.getByRole("link", { name: "All notes" }));
    }
    await click(page.getByRole("button", { name: "Sign out" }));
    await fill(page.getByLabelText("Email"), writer.email);
    await fill(page.getByLabelText("Password"), writer.password);
    await click(page.getByRole("main").getByRole("button", { name: "Sign in" }));

    await expect.element(page.getByText(`Signed in as ${writer.name}`)).toBeInTheDocument();
    await expect
      .element(
        page.getByText(titles.length === 1 ? "1 note" : `${titles.length} notes`, { exact: true }),
      )
      .toBeInTheDocument();
    const user = await storedUser(writer.email);
    expect(user?.name).toBe(writer.name);
    expect(await sessionCount(user!.id)).toBe(1);
  });
}
