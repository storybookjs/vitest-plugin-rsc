import { expect, test } from "vitest";
import { createNextDocumentFlightStream } from "./app-index.ts";

test("rebuilds document Flight stream from Next inline bootstrap scripts", async () => {
  const stream = createNextDocumentFlightStream(`
    <script>(self.__next_f=self.__next_f||[]).push([0])</script>
    <script>self.__next_f.push([1,"1:{\\"ok\\":true}\\n"])</script>
  `);

  await expect(readStreamText(stream)).resolves.toBe('1:{"ok":true}\n');
});

test("rebuilds document Flight stream from multiple pushes in one inline script", async () => {
  const stream = createNextDocumentFlightStream(`
    <script>
      (self.__next_f=self.__next_f||[]).push([0]);
      self.__next_f.push([1,"1:{\\"ok\\":true}\\n"]);
    </script>
  `);

  await expect(readStreamText(stream)).resolves.toBe('1:{"ok":true}\n');
});

async function readStreamText(stream: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
}
