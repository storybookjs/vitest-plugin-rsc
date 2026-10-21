import { expect, test } from "vitest";
import { downloadName } from "./downloads.ts";

// An answer at `url`, with `Content-Disposition: disposition`. A header is
// bytes: UTF-8 in it reads as one character per byte.
const answer = (url: string, disposition?: string) => {
  const headers = new Headers();
  if (disposition !== undefined) {
    const bytes = new TextEncoder().encode(disposition);
    headers.set("content-disposition", String.fromCharCode(...bytes));
  }
  return Object.defineProperty(new Response("", { headers }), "url", { value: url });
};
const url = "http://localhost/api/export/report%20q1.csv";

test("is no download without an attachment or a download request", () => {
  expect(downloadName(answer(url), null)).toBeUndefined();
  expect(downloadName(answer(url, 'inline; filename="a.csv"'), null)).toBeUndefined();
  expect(downloadName(answer(url, 'filename="a.csv"'), null)).toBeUndefined();
});

test("takes a type other than inline as an attachment, as RFC 6266 says", () => {
  expect(downloadName(answer(url, "Attachment"), null)).toBe("report q1.csv");
  expect(downloadName(answer(url, 'x-unknown; filename="a.csv"'), null)).toBe("a.csv");
});

test("names the file by the server, then by the link, then by the URL", () => {
  const named = 'attachment; filename="notes.csv"';
  expect(downloadName(answer(url, named), "export.csv")).toBe("notes.csv");
  expect(downloadName(answer(url, "attachment"), "export.csv")).toBe("export.csv");
  expect(downloadName(answer(url), "")).toBe("report q1.csv");
  expect(downloadName(answer("http://localhost/"), "")).toBe("download");
});

test("reads filename* first, in the charset it names", () => {
  const both = `attachment; filename="rates.csv"; filename*=UTF-8''%E2%82%AC%20rates.csv`;
  expect(downloadName(answer(url, both), null)).toBe("€ rates.csv");
  const latin1 = "attachment; filename*=ISO-8859-1''caf%E9.csv";
  expect(downloadName(answer(url, latin1), null)).toBe("café.csv");
});

test("reads a filename as UTF-8, with its escapes", () => {
  expect(downloadName(answer(url, 'attachment; filename="café.csv"'), null)).toBe("café.csv");
  expect(downloadName(answer(url, 'attachment; filename="a \\"b\\".csv"'), null)).toBe('a "b".csv');
  expect(downloadName(answer(url, "attachment; filename=caf%C3%A9.csv"), null)).toBe("café.csv");
  expect(downloadName(answer(url, "attachment; FileName=plain.csv"), null)).toBe("plain.csv");
});
