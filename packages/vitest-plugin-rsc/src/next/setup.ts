import { afterEach } from "vitest";
import { cleanup } from "./index.ts";

// Registered by `vitestPluginNext()` as a setup file. Importing the entry
// first matters: it installs the server's platform before a test file can
// import a module of Next's server.
afterEach(cleanup);
