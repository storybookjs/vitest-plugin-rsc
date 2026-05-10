import { vi, beforeEach } from "vitest";
import * as flashCookieModule from "#lib/flash-cookie.ts";

vi.mock("#lib/flash-cookie.ts");

const { deleteFlashCookies } = flashCookieModule as typeof import("#lib/__mocks__/flash-cookie.ts");

beforeEach(() => {
  deleteFlashCookies();
});
