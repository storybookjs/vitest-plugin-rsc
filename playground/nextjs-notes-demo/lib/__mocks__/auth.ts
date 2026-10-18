import { fn } from "storybook/test";

// What `sb.mock()` in .storybook/preview.tsx takes for `#lib/auth.ts`: the
// mock that vitest.setup.ts makes with a factory, which Vitest takes instead
// of this file. Better Auth does not run: a story says what an API answers,
// like `mocked(auth.api.listPasskeys).mockResolvedValue([...])`.
export const auth = {
  api: {
    deletePasskey: fn(),
    listPasskeys: fn(async () => []),
    signInEmail: fn(),
    signInMagicLink: fn(),
    signOut: fn(),
    signUpEmail: fn(),
  },
};
