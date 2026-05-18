import { expect, test } from "vitest";

test("browser fetch dispatches route handler HTTP methods through MSW Edge dispatch", async () => {
  const get = await fetch("/api/route-handler-matrix/browser-get?q=methods");
  await expect(get.json()).resolves.toMatchObject({
    id: "browser-get",
    method: "GET",
    query: "methods",
    requestCookie: null,
  });
  expect(get.status).toBe(200);
  expect(get.headers.get("content-type")).toContain("application/json");

  const post = await fetch("/api/route-handler-matrix/post", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "posted from browser" }),
  });
  await expect(post.json()).resolves.toEqual({
    body: { title: "posted from browser" },
    id: "post",
    method: "POST",
    requestCookie: null,
  });

  const put = await fetch("/api/route-handler-matrix/put", {
    method: "PUT",
    headers: { "content-type": "text/plain" },
    body: "put body from browser",
  });
  await expect(put.json()).resolves.toEqual({
    id: "put",
    method: "PUT",
    text: "put body from browser",
  });

  const patch = await fetch("/api/route-handler-matrix/patch", { method: "PATCH" });
  await expect(patch.json()).resolves.toEqual({ id: "patch", method: "PATCH" });

  const deleted = await fetch("/api/route-handler-matrix/delete", { method: "DELETE" });
  await expect(deleted.json()).resolves.toEqual({ id: "delete", method: "DELETE" });

  const options = await fetch("/api/route-handler-matrix/options", { method: "OPTIONS" });
  expect(options.status).toBe(204);
  expect(options.headers.get("allow")).toBe("GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS");
});

test("browser fetch preserves route handler streamed and uploaded bodies through MSW", async () => {
  const streamed = await fetch("/api/route-handler-matrix/streamed?mode=stream");

  expect(streamed.status).toBe(200);
  expect(streamed.headers.get("content-type")).toContain("text/plain");
  await expect(readResponseStream(streamed)).resolves.toBe("stream streamed done");

  const upload = createTextStream(["streamed ", "request ", "body"]);
  const response = await fetch("/api/route-handler-matrix/stream-put", {
    method: "PUT",
    headers: { "content-type": "text/plain" },
    body: upload,
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    id: "stream-put",
    method: "PUT",
    text: "streamed request body",
  });
});

async function readResponseStream(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Expected browser fetch response to expose a readable body stream.");
  }

  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    text += decoder.decode(result.value, { stream: true });
  }
  return text + decoder.decode();
}

function createTextStream(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}
