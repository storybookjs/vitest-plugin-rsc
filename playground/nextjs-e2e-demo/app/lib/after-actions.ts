"use server";

import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { audit } from "./audit.ts";

// Passes after() a promise that reads the request once the action is done,
// and Next has rendered the page after it.
export async function auditLater() {
  after(
    (async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const who = (await cookies()).get("who")?.value;
      const client = (await headers()).get("x-client") ?? "no x-client";
      audit(`after the action: ${who} with ${client}`);
    })(),
  );
}

// Sets a cookie after an `await` of its own.
export async function rememberLater(value: string) {
  await new Promise((resolve) => setTimeout(resolve, 50));
  (await cookies()).set("remembered", value);
}

// Calls a static route of the app, which works on after its response, and
// then sets a cookie.
export async function rememberAfterStaticRoute(value: string) {
  const origin = (await headers()).get("origin");
  await (await fetch(`${origin}/api/static-linger`)).text();
  (await cookies()).set("remembered", value);
}
