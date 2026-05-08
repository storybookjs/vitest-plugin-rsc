import { vi, beforeEach } from "vitest";
import { deleteFlashCookies } from "#lib/flash-cookie.mock.ts";

vi.mock("#lib/flash-cookie.ts", () => import("#lib/flash-cookie.mock.ts"));

beforeEach(() => {
  deleteFlashCookies();
});
