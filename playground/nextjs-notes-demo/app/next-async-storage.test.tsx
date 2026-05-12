import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { createAsyncLocalStorage } from "next/dist/server/app-render/async-local-storage.js";
import { renderServer } from "#test/render.tsx";

const nextAsyncStorage = createAsyncLocalStorage<{ route: string }>();

function NextAsyncStorageProbe() {
  return <p>Next async storage route: {nextAsyncStorage.getStore()?.route ?? "missing"}</p>;
}

test("renders with Next's app-render async storage wrapper", async () => {
  await nextAsyncStorage.run({ route: "/next-async-storage" }, () =>
    renderServer(<NextAsyncStorageProbe />, { url: "/next-async-storage" }),
  );

  await expect
    .element(page.getByText("Next async storage route: /next-async-storage"))
    .toBeInTheDocument();
});
