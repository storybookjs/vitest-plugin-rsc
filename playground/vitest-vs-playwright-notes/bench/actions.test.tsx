import { test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { buttonNamed, hasHeading, seedApp } from "./app.ts";
import { measure, untilDom } from "./harness.ts";

// A Server Action: a native `click()` of the submit button of its form,
// until the DOM shows what it did. `server` is the action's request (with
// the page Next renders into its response), `client` the rest.

test("server action that redirects", async () => {
  await seedApp();
  let title = "";
  await measure(
    "Server Action › create a note, redirect to it",
    async () => {
      buttonNamed("Create note").click();
      await untilDom(() => hasHeading(title));
    },
    {
      split: true,
      before: async (i) => {
        await renderServer({ url: "/notes/new" });
        title = `Created ${i}`;
        document.querySelector<HTMLInputElement>("#title")!.value = title;
      },
    },
  );
});

test("server action that refreshes in place", async () => {
  const { notes } = await seedApp();
  await renderServer({ url: `/notes/${notes[0]!.id}` });
  const button = () => document.querySelector<HTMLButtonElement>("button[aria-pressed]")!;
  await measure(
    "Server Action › toggle a favorite, refresh in place",
    async () => {
      const target = button().textContent === "Favorite" ? "Unfavorite" : "Favorite";
      button().click();
      await untilDom(() => button().textContent === target);
    },
    { split: true },
  );
});
