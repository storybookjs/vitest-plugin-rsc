import { deleteFlashCookies } from "#lib/flash-cookie.ts";

// Forgets the flash cookies of the browser, which a page calls once it has
// shown them: see components/forget-flash.tsx.
export async function DELETE() {
  await deleteFlashCookies();
  return new Response(null, { status: 204 });
}
