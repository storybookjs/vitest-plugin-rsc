"use server";

import { redirect } from "next/navigation";

export async function saveDelegatedNote(title: string) {
  return `saved note: ${title}`;
}

export async function redirectDelegatedAction() {
  redirect("/route-patterns/conventions?from=edge-action-redirect");
}

export async function replaceRedirectDelegatedAction() {
  redirect("/route-patterns/conventions?from=edge-action-replace", "replace");
}
