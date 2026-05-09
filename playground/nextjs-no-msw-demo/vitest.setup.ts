import { beforeEach } from "vitest";
import { cleanup, initialize } from "vitest-plugin-rsc/nextjs/testing-library";

initialize();

beforeEach(async () => {
  await cleanup();
});
