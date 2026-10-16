// vitest.setup.ts replaces this module with a mock, so this code never runs:
// the browser layer does not load the file with `"use client"` that it
// imports either. See client.test.tsx.
import "../../test/locale-of-mocked-module.tsx";

export const real = true;
