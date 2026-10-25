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
