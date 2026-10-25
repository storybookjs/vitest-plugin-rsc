import { expect, test } from "./test.ts";
import { sessionCount, storedUser } from "#test/db.ts";

// Signs up, writes notes, signs out and signs back in, and finds them.
// Variants 0 to 24 are in flow-account-1.spec.ts.
for (let i = 25; i < 50; i++) {
  const person = {
    name: `Writer ${i}`,
    email: `writer${i}@example.com`,
    password: `password ${i}`,
  };
  const titles = Array.from({ length: (i % 3) + 1 }, (_, k) => `Writer ${i}, note ${k}`);
  test(`signs up, writes ${titles.length} notes and comes back, variant ${i}`, async ({ page }) => {
    await page.goto("/sign-up");

    await page.getByLabel("Name").fill(person.name);
    await page.getByLabel("Email").fill(person.email);
    await page.getByLabel("Password").fill(person.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(`Welcome, ${person.name}!`)).toBeVisible();
    for (const title of titles) {
      await page.getByRole("link", { name: "New note" }).click();
      await page.getByLabel("Title").fill(title);
      await page.getByRole("button", { name: "Create note" }).click();
      await expect(page.getByText("Note created.")).toBeVisible();
      await page.getByRole("link", { name: "All notes" }).click();
    }
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByLabel("Email").fill(person.email);
    await page.getByLabel("Password").fill(person.password);
    await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText(`Signed in as ${person.name}`)).toBeVisible();
    await expect(
      page.getByText(titles.length === 1 ? "1 note" : `${titles.length} notes`, { exact: true }),
    ).toBeVisible();
    expect(await sessionCount()).toBe(1);
    expect((await storedUser(person.email))?.name).toBe(person.name);
  });
}
