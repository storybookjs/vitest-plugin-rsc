import { expect, test } from "vitest";
import { actionIdsOf } from "./action-ids.ts";
import { registry, type ServerRequest } from "./registry.ts";

registry.Response = Response;

// A request as the server gets it, with the body of `init` as a stream.
const requestOf = (init: RequestInit): ServerRequest => {
  const request = new Request("http://localhost/notes", { method: "POST", ...init });
  return { url: request.url, method: request.method, headers: request.headers, body: request.body };
};

const form = (entries: [string, string][]) => {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
};

test("names the action of the next-action header of Next's router", async () => {
  const request = requestOf({ headers: { "next-action": "app/actions.ts#save" }, body: "[]" });

  expect(await actionIdsOf(request)).toEqual(["app/actions.ts#save"]);
});

test("names the actions of the fields of a form that the browser posts itself", async () => {
  const request = requestOf({
    body: form([
      ["$ACTION_ID_app/actions.ts#save", ""],
      ["$ACTION_REF_1", ""],
      ["$ACTION_1:0", JSON.stringify({ id: "app/actions.ts#append", bound: "$@1" })],
      ["$ACTION_1:1", "[]"],
      ["title", "A note"],
    ]),
  });

  expect(await actionIdsOf(request)).toEqual(["app/actions.ts#save", "app/actions.ts#append"]);
});

test("leaves the request a body to read, which has the whole form", async () => {
  const request = requestOf({
    body: form([
      ["$ACTION_ID_123", ""],
      ["title", "A note"],
    ]),
  });

  expect(await actionIdsOf(request)).toEqual(["123"]);

  expect(request.body).toBeInstanceOf(ReadableStream);
  const body = request.body as ReadableStream<Uint8Array>;
  const read = await new Response(body, { headers: request.headers }).formData();
  expect(read.get("title")).toBe("A note");
});

test("names none for a form of text, for a reference that is not one, and for a GET", async () => {
  expect(await actionIdsOf(requestOf({ body: new URLSearchParams({ title: "A note" }) }))).toEqual(
    [],
  );
  expect(
    await actionIdsOf(
      requestOf({
        body: form([
          ["$ACTION_REF_1", ""],
          ["$ACTION_1:0", "{"],
        ]),
      }),
    ),
  ).toEqual([]);
  expect(await actionIdsOf({ ...requestOf({}), method: "GET", body: null })).toEqual([]);
});
