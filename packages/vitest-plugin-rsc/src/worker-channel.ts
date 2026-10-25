import type { PageHost } from "./page-host.ts";
import { answerKey, isAnswer, questionKey, type WorkerQuestion } from "./page-protocol.ts";

// What a page in a worker of Node.js asks the dev server besides its modules,
// like the stylesheets of a route: on the worker's own channel to Vitest's
// process, next to Vitest's messages, which the plugin's pool answers there
// (worker-pool.ts). In order, without a connection of its own.

// As a test may replace them.
const send = process.send?.bind(process);
const on = process.on.bind(process);
const off = process.off.bind(process);

const waiting = new Map<number, { resolve(result: unknown): void; reject(error: Error): void }>();
// One count for the worker: this module is evaluated again after a change of
// it, and its questions before then may still wait.
const counter = ((globalThis as unknown as Record<PropertyKey, { last: number } | undefined>)[
  Symbol.for("vitest-plugin-rsc:worker-questions")
] ??= { last: 0 });

function onAnswer(message: unknown): void {
  if (!isAnswer(message)) return;
  const id = message[answerKey];
  const answered = waiting.get(id);
  if (!answered) return;
  waiting.delete(id);
  // Listens while it waits only: an evaluation of this module of before a
  // change stops listening once it got its answers.
  if (waiting.size === 0) off("message", onAnswer);
  if (message.error === undefined) answered.resolve(message.result);
  else answered.reject(new Error(`vitest-plugin-rsc: the dev server answered: ${message.error}`));
}

/** Sends `data` to the dev server at `event`, and resolves with what it answers. */
export const askOverWorkerChannel: PageHost["request"] = (event, data) => {
  if (!send) {
    return Promise.reject(
      new Error(
        "vitest-plugin-rsc: a page in Node.js asks the dev server on the channel of a worker " +
          "that Vitest forked, and this process has none",
      ),
    );
  }
  const id = ++counter.last;
  return new Promise((resolve, reject) => {
    if (waiting.size === 0) on("message", onAnswer);
    waiting.set(id, { resolve, reject });
    try {
      send({ [questionKey]: id, event, data } satisfies WorkerQuestion);
    } catch (error) {
      // A question that the channel cannot carry, or a channel that closed.
      waiting.delete(id);
      if (waiting.size === 0) off("message", onAnswer);
      reject(error);
    }
  });
};
