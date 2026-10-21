import { expect, test } from "vitest";
import { formBody } from "./form-submission.ts";

const form = () => {
  const data = new FormData();
  data.append("name", "Ada Lovelace");
  data.append("note", "a & b");
  data.append("file", new File(["contents"], "notes.txt", { type: "text/plain" }));
  return data;
};

test("encodes a form as a browser does by default, with the names of its files", async () => {
  const body = formBody(form(), "application/x-www-form-urlencoded");

  expect(body).toBeInstanceOf(URLSearchParams);
  expect(String(body)).toBe("name=Ada+Lovelace&note=a+%26+b&file=notes.txt");
  // The content type that Next's server reads to tell a form from a Server Action.
  expect(
    new Request("http://localhost/", { method: "POST", body }).headers.get("content-type"),
  ).toBe("application/x-www-form-urlencoded;charset=UTF-8");
});

test("sends the entries of a multipart form as they are, files too", () => {
  const data = form();

  expect(formBody(data, "multipart/form-data")).toBe(data);
});

test("encodes a form of text/plain a line for each entry", () => {
  expect(formBody(form(), "text/plain")).toBe(
    "name=Ada Lovelace\r\nnote=a & b\r\nfile=notes.txt\r\n",
  );
});
