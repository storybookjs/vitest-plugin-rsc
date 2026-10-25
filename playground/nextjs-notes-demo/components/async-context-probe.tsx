import { cookies } from "next/headers";

// What a Server Component reads of its request after an `await`, for
// async-context.node.test.tsx. On Node.js the stores of `AsyncLocalStorage`
// carry it there, and to what the render starts and does not wait for.

/** What the reads of the cookie `probe` saw, by their label, in order. */
export const cookieReads: { label: string; cookie: string | undefined }[] = [];

async function readCookie(label: string, delay: number): Promise<string | undefined> {
  // With the speed feature `immediates`, a timer of no delay is a task that
  // the page's host runs, not the page's timer.
  await new Promise((resolve) => setTimeout(resolve, delay));
  const cookie = (await cookies()).get("probe")?.value;
  cookieReads.push({ label, cookie });
  return cookie;
}

/**
 * The cookie `probe`, read after an `await`. With `outlive`, read again that
 * many ms later by work that the render does not wait for.
 */
export async function AsyncContextProbe({ label, outlive }: { label: string; outlive?: number }) {
  const cookie = await readCookie(label, 0);
  if (outlive !== undefined) {
    readCookie(`${label}, later`, outlive).catch((error: unknown) => {
      cookieReads.push({ label: `${label}, later`, cookie: `error: ${String(error)}` });
    });
  }
  return <p>{`${label}: ${cookie ?? "none"}`}</p>;
}
