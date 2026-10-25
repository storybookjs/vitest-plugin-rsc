import { afterAll, expect, test, vi } from "vitest";

const serverImmediate = vi.hoisted(() => vi.fn((_callback: () => void) => () => {}));
vi.mock("virtual:vitest-plugin-rsc/page-host", () => ({
  // A host of Node.js, whose immediates are the runtime's.
  default: { immediatesOfRuntime: true, serverImmediate },
}));
vi.mock("virtual:vitest-plugin-rsc/next-env", () => ({
  default: { ASSIGNED_FIRST: "of-the-env", NOT_ASSIGNED: "of-the-env" },
}));

afterAll(() => {
  delete process.env.ASSIGNED_FIRST;
  delete process.env.NOT_ASSIGNED;
});

test("fills the env of the run into the names that the page's process.env does not have", async () => {
  process.env.ASSIGNED_FIRST = "of-the-page";

  await import("./globals.ts");

  expect(process.env.ASSIGNED_FIRST).toBe("of-the-page");
  expect(process.env.NOT_ASSIGNED).toBe("of-the-env");
});

test("the bytes of a form decode the same at every call, as Node's Buffer decodes them", async () => {
  await import("./globals.ts");
  type Slices = { utf8Slice(start?: number, end?: number): string; ucs2Slice(): string };
  // An incomplete character at the end of one call is not the start of the next.
  const cut = new Uint8Array([0x61, 0xe3, 0x83]) as unknown as Slices;
  const te = new Uint8Array([0xe3, 0x83, 0x86]) as unknown as Slices;

  expect(cut.utf8Slice()).toBe("a�");
  expect(te.utf8Slice()).toBe("テ");
  expect(te.utf8Slice(0, 3)).toBe("テ");
  expect((new Uint8Array([0x61, 0x00]) as unknown as Slices).ucs2Slice()).toBe("a");
});

test("a server's setImmediate is the host's of the runtime, also without the speed feature", async () => {
  await import("./globals.ts");
  const { registry } = await import("./registry.ts");
  const callback = vi.fn();

  registry.setImmediate(callback, "an argument");
  expect(serverImmediate).toHaveBeenCalledOnce();
  serverImmediate.mock.calls[0]![0]();

  expect(callback).toHaveBeenCalledWith("an argument");
});
