import { afterAll, expect, test } from "vitest";
import { answerKey, questionKey, type WorkerQuestion } from "./page-protocol.ts";

// The worker's channel to Vitest's process, as the module finds it.
const sent: WorkerQuestion[] = [];
// What the channel cannot carry, as a function.
let uncloneable = false;
const send = process.send;
process.send = ((message: WorkerQuestion) => {
  if (uncloneable) throw new Error("could not be cloned");
  sent.push(message);
  return true;
}) as typeof process.send;
afterAll(() => {
  process.send = send;
});
const { askOverWorkerChannel } = await import("./worker-channel.ts");

const answer = (id: number, answered: object) =>
  process.emit("message" as never, { [answerKey]: id, ...answered } as never);

test("asks on the worker's channel, and resolves with the answer of its question", async () => {
  const first = askOverWorkerChannel("stylesheets", { entry: "/a" });
  const second = askOverWorkerChannel("stylesheets", { entry: "/b" });
  expect(sent.map((question) => [question.event, question.data])).toEqual([
    ["stylesheets", { entry: "/a" }],
    ["stylesheets", { entry: "/b" }],
  ]);
  const [a, b] = sent.map((question) => question[questionKey]);

  answer(b!, { result: "b" });
  answer(a!, { result: "a" });

  expect(await Promise.all([first, second])).toEqual(["a", "b"]);
});

test("rejects with what the server says where it has no answer", async () => {
  const asked = askOverWorkerChannel("unknown", {});
  answer(sent.at(-1)![questionKey], { error: "no answer at unknown" });
  await expect(asked).rejects.toThrow("the dev server answered: no answer at unknown");
});

test("listens only while a question waits", async () => {
  const listening = () => process.listeners("message").length;
  const before = listening();
  const asked = askOverWorkerChannel("x", {});
  expect(listening()).toBe(before + 1);
  answer(sent.at(-1)![questionKey], { result: 1 });
  await asked;
  expect(listening()).toBe(before);
});

test("rejects a question that the channel cannot carry, and waits for no answer to it", async () => {
  const listening = () => process.listeners("message").length;
  const before = listening();
  uncloneable = true;
  try {
    await expect(askOverWorkerChannel("x", { f() {} })).rejects.toThrow("could not be cloned");
  } finally {
    uncloneable = false;
  }
  expect(listening()).toBe(before);
});
