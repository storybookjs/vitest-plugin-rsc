import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { beforeEach, expect, test, vi, type MockInstance } from "vitest";
import { page } from "vitest/browser";

// What a browser would save: the name and the body of each `<a download>`
// that the plugin clicks, in place of a file in the downloads folder.
let downloads: Promise<{ name: string; text: string }>[];
let reportError: MockInstance<typeof window.reportError>;
beforeEach(() => {
  downloads = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
    function (this: HTMLAnchorElement) {
      // The plugin revokes the Blob URL once the click is done.
      const body = fetch(this.href).then((response) => response.text());
      downloads.push(body.then((text) => ({ name: this.download, text })));
    },
  );
  // An uncaught error, which would fail this test run too.
  reportError = vi.spyOn(window, "reportError").mockImplementation(() => {});
});

test("downloads what a route handler answers as an attachment, and stays on the page", async () => {
  await renderServer({ url: "/exports" });

  await page.getByRole("link", { name: "Notes as CSV", exact: true }).click();

  await expect.poll(() => downloads).toHaveLength(1);
  expect(await downloads[0]).toEqual({ name: "notes.csv", text: "id,title\n1,Groceries\n" });
  await expect.element(page.getByRole("heading", { name: "Exports" })).toBeVisible();
  expect(location.pathname).toBe("/exports");
  expect(reportError).not.toHaveBeenCalled();
});

test("takes the server's name for a file over the one of the link, as a browser does", async () => {
  await renderServer({ url: "/exports" });

  await page.getByRole("link", { name: "Notes as CSV, named by the link" }).click();

  await expect.poll(() => downloads).toHaveLength(1);
  expect(await downloads[0]).toEqual({ name: "notes.csv", text: "id,title\n1,Groceries\n" });
  await expect.element(page.getByRole("heading", { name: "Exports" })).toBeVisible();
  expect(reportError).not.toHaveBeenCalled();
});

test("downloads what a link with `download` links to, under the link's name", async () => {
  await renderServer({ url: "/exports" });

  await page.getByRole("link", { name: "Summary as a file" }).click();

  await expect.poll(() => downloads).toHaveLength(1);
  expect(await downloads[0]).toEqual({ name: "summary.json", text: '{"notes":1}' });
  await expect.element(page.getByRole("heading", { name: "Exports" })).toBeVisible();
  expect(reportError).not.toHaveBeenCalled();
});

test("reports a navigation to data that a browser would show, and stays on the page", async () => {
  await renderServer({ url: "/exports" });

  await page.getByRole("link", { name: "Summary", exact: true }).click();

  await expect.poll(() => reportError.mock.calls).toHaveLength(1);
  expect(String(reportError.mock.calls[0]![0])).toMatch(
    `the app navigated to a URL that is not a page: ${location.origin}/api/export/summary ` +
      "responded with application/json. A browser would show it in place of the app",
  );
  await expect.element(page.getByRole("heading", { name: "Exports" })).toBeVisible();
  expect(downloads).toHaveLength(0);
});

test("downloads a file of public/, which the network has", async () => {
  await renderServer({ url: "/exports" });

  await page.getByRole("link", { name: "A file of public/" }).click();

  await expect.poll(() => downloads).toHaveLength(1);
  expect(await downloads[0]).toEqual({
    name: "host.json",
    text: '{ "from": "public/host.json" }\n',
  });
  expect(reportError).not.toHaveBeenCalled();
});

test("reports a download that fails, and saves nothing", async () => {
  await renderServer({ url: "/exports" });

  await page.getByRole("link", { name: "An export that fails" }).click();

  await expect.poll(() => reportError.mock.calls).toHaveLength(1);
  expect(String(reportError.mock.calls[0]![0])).toMatch(
    `the download of ${location.origin}/api/export/failed failed: it responded with 500`,
  );
  expect(downloads).toHaveLength(0);
});

test("saves every file of downloads in a row, as a browser does", async () => {
  await renderServer({ url: "/exports" });

  await page.getByRole("link", { name: "Notes as CSV, named by the link" }).click();
  await page.getByRole("link", { name: "Summary as a file" }).click();

  await expect.poll(() => downloads).toHaveLength(2);
  const names = (await Promise.all(downloads)).map(({ name }) => name);
  expect(names.sort()).toEqual(["notes.csv", "summary.json"]);
  expect(reportError).not.toHaveBeenCalled();
});

test("leaves the download of its Blob URL to the browser", async () => {
  vi.mocked(HTMLAnchorElement.prototype.click).mockRestore();
  const clicked = vi.spyOn(HTMLAnchorElement.prototype, "click");
  // Heard after the plugin's listener: whether it took the navigation.
  const taken: boolean[] = [];
  const navigation = (window as unknown as { navigation: EventTarget }).navigation;
  const heard = (event: Event) => taken.push(event.defaultPrevented);
  navigation.addEventListener("navigate", heard);
  await renderServer({ url: "/exports" });

  try {
    await page.getByRole("link", { name: "Notes as CSV", exact: true }).click();

    await expect.poll(() => clicked).toHaveBeenCalledOnce();
    expect((clicked.mock.contexts[0] as HTMLAnchorElement).href).toMatch(/^blob:/);
    expect(taken.at(-1)).toBe(false);
    await expect.element(page.getByRole("heading", { name: "Exports" })).toBeVisible();
    expect(reportError).not.toHaveBeenCalled();
  } finally {
    navigation.removeEventListener("navigate", heard);
  }
});
