"use client";

import { setLocale } from "../app/lib/locale.ts";

// What app/lib/mocked-in-setup.ts imports, which vitest.setup.ts mocks. Were
// this loaded, it would run after test/setup-locale.tsx, and win.
setLocale("of a mocked module");
