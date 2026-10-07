import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import { page } from "vitest/browser";
import logo from "./logo.png";

// Images: Next's image loader for an imported image, and its image optimizer
// behind `/_next/image`, where next/image gets its images from.

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.restoreAllMocks();
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  // React reports a hydration mismatch here, and Next a failed render.
  expect(consoleError.mock.calls).toEqual([]);
});

const naturalWidth = (image: { element(): Element }) =>
  (image.element() as HTMLImageElement).naturalWidth;
const optimized = (url: string, width: number) =>
  `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=75`;

test("imports an image as the object next/image takes", async () => {
  await renderServer({ url: "/images" });

  await expect.element(page.getByText("Logo: 40×30")).toBeVisible();
  expect(logo).toMatchObject({ width: 40, height: 30 });
  expect(logo.src).toMatch(/^\/_next\/static\/media\/logo\.\w{8}\.png$/);
  // Served where Next's build puts it.
  const plain = page.getByRole("img", { name: "Plain logo" });
  await expect.poll(() => naturalWidth(plain)).toBe(40);
});

test("renders next/image with an imported image, through the image optimizer", async () => {
  await renderServer({ url: "/images" });

  const image = page.getByRole("img", { name: "Logo", exact: true });
  await expect.element(image).toHaveAttribute("width", "40");
  await expect.element(image).toHaveAttribute("height", "30");
  await expect.element(image).toHaveAttribute("src", optimized(logo.src, 96));
  await expect.poll(() => naturalWidth(image)).toBe(40);

  const response = await fetch(optimized(logo.src, 96), { headers: { accept: "image/webp" } });
  expect(response.headers.get("content-type")).toBe("image/webp");
});

test("shows the blurred placeholder of an imported image", async () => {
  await renderServer({ url: "/images" });

  const image = page.getByRole("img", { name: "Logo with a placeholder" });
  expect(logo.blurDataURL).toMatch(/^data:image\/png;base64,/);
  // In the HTML of the server; Next takes it away once the image has loaded.
  const html = await (await fetch("/images", { headers: { accept: "text/html" } })).text();
  expect(html).toContain(logo.blurDataURL!.slice("data:image/png;base64,".length, 60));
  await expect.poll(() => naturalWidth(image)).toBe(40);
});

test("renders next/image with an imported SVG, which Next does not optimize", async () => {
  await renderServer({ url: "/images" });

  const image = page.getByRole("img", { name: "Mark" });
  await expect.element(image).toHaveAttribute("width", "24");
  expect(image.element().getAttribute("src")).toMatch(/^\/_next\/static\/media\/mark\.\w{8}\.svg$/);
  await expect.poll(() => naturalWidth(image)).toBe(24);
});

test("renders next/image with an image in public/, through the image optimizer", async () => {
  await renderServer({ url: "/images" });

  const image = page.getByRole("img", { name: "Hill" });
  await expect.element(image).toHaveAttribute("src", optimized("/photos/hill.png", 128));
  await expect.poll(() => naturalWidth(image)).toBe(64);
});

test("renders next/image with an image of another server that next.config allows", async () => {
  await renderServer({ url: "/images/remote" });

  const photo = page.getByRole("img", { name: "Photo" });
  await expect
    .element(photo)
    .toHaveAttribute("src", optimized(`${location.origin}/photos/hill.png`, 128));
  await expect.poll(() => naturalWidth(photo)).toBe(64);
});

test("refuses to optimize an image that next.config does not allow", async () => {
  const response = await fetch(optimized("https://images.example.com/photo.png", 128));

  expect(response.status).toBe(400);
  expect(await response.text()).toBe('"url" parameter is not allowed');
});
