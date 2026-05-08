/// <reference types="@vitest/browser/context" />
import { configure } from "@testing-library/dom";

import MockDate from "mockdate";
import { beforeAll, beforeEach, vi } from "vitest";
import { cleanup, initialize } from "vitest-plugin-rsc/nextjs/testing-library";
import "app/style.css";

vi.mock(import("../libs/session"), { spy: true });
vi.mock(import("../libs/notes"), () => ({ getNote: vi.fn(), setNote: vi.fn() }));

beforeAll(async () => {
  configure({ asyncUtilTimeout: 2000 });
  initialize();
});

beforeEach(async (context) => {
  await cleanup();
  MockDate.set(new Date(2012, 3, 4, 5, 6, 7));
});
