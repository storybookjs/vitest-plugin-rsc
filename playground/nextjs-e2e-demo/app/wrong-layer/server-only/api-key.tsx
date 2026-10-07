"use client";

// A mistake `next build` stops at: a Client Component imports server-only code.
import { getApiKey } from "../../lib/secrets.ts";

export function ApiKey() {
  return <p>API key: {getApiKey()}</p>;
}
