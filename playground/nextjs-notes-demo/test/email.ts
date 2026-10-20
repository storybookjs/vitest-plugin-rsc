import { onTestFinished, vi } from "vitest";

/**
 * The links of the mails the app sends in this test. Outside production,
 * without Resend, lib/email.ts logs a mail with `console.info`, in the
 * document of the test.
 */
export function watchSentLinks(): () => URL[] {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  onTestFinished(() => info.mockRestore());
  return () =>
    info.mock.calls.flatMap(([message]) =>
      [...String(message).matchAll(/https?:\/\/\S+/g)].map(([link]) => new URL(link)),
    );
}
