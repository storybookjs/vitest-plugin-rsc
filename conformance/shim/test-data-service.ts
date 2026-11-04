// Stands in for `test/lib/test-data-service/writer.ts`: an HTTP server that
// Next's test starts in its own Node.js process, for the app to fetch from as
// it renders, and the test to answer. The test runs in a tab here, as does the
// server of the app, and neither can listen on a port: this server is never
// reached. The app's request to it fails, so a test that waits for one does
// not pass. The others of its file run.
import { unsupported } from "./unsupported.ts";

type TestDataResponse = {
  resolve: (value?: string) => void;
  reject: (error: Error, status?: number) => void;
};

// The servers that wait for a port of `findPort()`.
let waiting = 0;

export function createTestDataServer(
  _onRequest: (key: string, response: TestDataResponse) => unknown,
) {
  waiting++;
  let listening = false;
  return {
    listen(_port: number) {
      if (!listening) waiting--;
      listening = true;
    },
    close() {},
  };
}

// `findPort()` of `next-test-utils`: a port for the data server above. Any
// other server of a test is one of Node.js.
let freePort = 40000;
export async function findPort(): Promise<number> {
  if (waiting === 0) {
    unsupported(
      "findPort() of next-test-utils: it starts a process, opens a socket or reads a build",
    );
  }
  return freePort++;
}
