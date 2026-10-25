import { fileURLToPath } from "node:url";
import {
  ForksPoolWorker,
  type PoolOptions,
  type PoolRunnerInitializer,
  type WorkerRequest,
} from "vitest/node";
import {
  answerKey,
  isQuestion,
  questionKey,
  type WorkerAnswer,
  type WorkerQuestion,
} from "./page-protocol.ts";

// The pool of a project whose page is in a worker of Node.js (index.ts):
// Vitest's own forks worker, `ForksPoolWorker` (`@experimental`), which forks
// `<distPath>/workers/forks.js`, with the plugin's entry there in place of
// Vitest's: see workers/forks.ts. Always the built entry, which Node.js and
// Bun run as it is, also for the source of the plugin, as for the modules of
// Node.js in src/node/. And it answers what the page asks on the worker's
// channel (worker-channel.ts), which Vitest does not see. Only Vitest loads
// this file, by its path: see `withNodeHostPool()` in index.ts.

const distPath = fileURLToPath(
  new URL(import.meta.url.endsWith(".ts") ? "../dist/" : "./", import.meta.url),
);

/** What the dev server answers the page at `event`, or nothing. */
export type PageAnswers = (event: string, data: object) => Promise<{ result: unknown } | undefined>;

/** The pool, which answers the page's questions with `answers`. */
export function createNodeHostPool(answers: PageAnswers): PoolRunnerInitializer {
  return {
    // Not "forks": Vitest takes its own entry for a pool of that name.
    name: nodeHostPoolName,
    createPoolWorker: (options) => new NodeHostWorker({ ...options, distPath }, answers),
  };
}

export const nodeHostPoolName = "vitest-plugin-rsc";

type Listener = (...args: any[]) => void;

class NodeHostWorker extends ForksPoolWorker {
  readonly #answers: PageAnswers;
  // Vitest's listeners of messages, as they hear them: without the page's.
  readonly #vitestListeners = new WeakMap<Listener, Listener>();

  constructor(options: PoolOptions, answers: PageAnswers) {
    super(options);
    this.#answers = answers;
  }

  override async start(): Promise<void> {
    await super.start();
    super.on("message", this.#answer);
  }

  #answer = (message: unknown) => {
    if (isQuestion(message)) void this.#answerQuestion(message);
  };

  async #answerQuestion({ [questionKey]: id, event, data }: WorkerQuestion): Promise<void> {
    let answer: WorkerAnswer;
    try {
      const answered = await this.#answers(event, data);
      answer = answered
        ? { [answerKey]: id, result: answered.result }
        : { [answerKey]: id, error: `no answer at ${event}` };
    } catch (error) {
      answer = { [answerKey]: id, error: String(error) };
    }
    // Not to a worker that stopped meanwhile.
    try {
      this.send(answer as unknown as WorkerRequest);
    } catch {}
  }

  override on(event: string, listener: Listener): void {
    if (event !== "message") return super.on(event, listener);
    let heard = this.#vitestListeners.get(listener);
    if (!heard) {
      heard = (message: unknown, ...rest: unknown[]) => {
        if (!isQuestion(message)) listener(message, ...rest);
      };
      this.#vitestListeners.set(listener, heard);
    }
    super.on(event, heard);
  }

  override off(event: string, listener: Listener): void {
    super.off(event, (event === "message" && this.#vitestListeners.get(listener)) || listener);
  }
}
