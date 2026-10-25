import { afterAll, expect, test, vi } from "vitest";

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

test("a response of the server has every header it was given, and reads its body by its content type", async () => {
  await import("./globals.ts");
  const { registry } = await import("./registry.ts");

  const form = new registry.Response(
    '--b\r\nContent-Disposition: form-data; name="a"\r\n\r\n1\r\n--b--\r\n',
    {
      status: 201,
      statusText: "Created",
      headers: {
        "content-type": "multipart/form-data; boundary=b",
        "set-cookie": "a=1",
        "x-a": "1",
      },
    },
  );
  expect(form.status).toBe(201);
  expect(form.statusText).toBe("Created");
  expect(form.headers.getSetCookie()).toEqual(["a=1"]);
  expect(form.headers.get("x-a")).toBe("1");
  expect((await form.clone().formData()).get("a")).toBe("1");
  expect((await form.blob()).type).toMatch(/^multipart\/form-data;/);

  // Without one of its own, the content type of its body.
  const text = new registry.Response("text", { headers: { "x-a": "1" } });
  expect(text.headers.get("content-type")).toBe("text/plain;charset=UTF-8");
  expect(new registry.Response(null).status).toBe(200);
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
