import { expect, test } from "./test.ts";
import { sessionCount, storedUser } from "#test/db.ts";
import { person } from "#test/people.ts";

// Signs up, writes notes, signs out and signs back in, and finds them.
for (let i = 0; i < 50; i++) {
  const titles = Array.from({ length: (i % 3) + 1 }, (_, k) => `Writer ${i}, note ${k}`);
  test(`signs up, writes ${titles.length} notes and comes back, variant ${i}`, async ({ page }) => {
    const writer = person({
      name: `Writer ${i}`,
      email: `writer${i}@example.com`,
      password: `password ${i}`,
    });
    await page.goto("/sign-up");

    await page.getByLabel("Name").fill(writer.name);
    await page.getByLabel("Email").fill(writer.email);
    await page.getByLabel("Password").fill(writer.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(`Welcome, ${writer.name}!`)).toBeVisible();
    for (const title of titles) {
      await page.getByRole("link", { name: "New note" }).click();
      await page.getByLabel("Title").fill(title);
      await page.getByRole("button", { name: "Create note" }).click();
      await expect(page.getByText("Note created.")).toBeVisible();
      await page.getByRole("link", { name: "All notes" }).click();
    }
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByLabel("Email").fill(writer.email);
    await page.getByLabel("Password").fill(writer.password);
    await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText(`Signed in as ${writer.name}`)).toBeVisible();
    await expect(
      page.getByText(titles.length === 1 ? "1 note" : `${titles.length} notes`, { exact: true }),
    ).toBeVisible();
    const user = await storedUser(writer.email);
    expect(user?.name).toBe(writer.name);
    expect(await sessionCount(user!.id)).toBe(1);
  });
}
