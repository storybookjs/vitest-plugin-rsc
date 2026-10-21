"use server";

import { updateTag } from "next/cache";

// What a Server Action does when it has changed the data.
export async function refreshQuotes() {
  updateTag("quotes");
}
