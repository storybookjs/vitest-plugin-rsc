import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
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

    await page.getByLabelText("Name").fill(writer.name);
    await page.getByLabelText("Email").fill(writer.email);
    await page.getByLabelText("Password").fill(writer.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect.element(page.getByText(`Welcome, ${writer.name}!`)).toBeInTheDocument();
    for (const title of titles) {
      await page.getByRole("link", { name: "New note" }).click();
      await page.getByLabelText("Title").fill(title);
      await page.getByRole("button", { name: "Create note" }).click();
      await expect.element(page.getByText("Note created.")).toBeInTheDocument();
      await page.getByRole("link", { name: "All notes" }).click();
    }
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByLabelText("Email").fill(writer.email);
    await page.getByLabelText("Password").fill(writer.password);
    await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

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
