// `node:child_process` in the tests, in place of the plugin's, which throws
// when called: the app's server asks git for its commit, and a test has no
// git to run. vitest.config.ts aliases the module to this file.
export function execSync(command: string): Buffer {
  if (command !== "git rev-parse --short HEAD") {
    throw new Error(`The tests run no ${JSON.stringify(command)}`);
  }
  return Buffer.from("abc1234\n");
}
