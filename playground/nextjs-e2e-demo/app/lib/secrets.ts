import "server-only";

// Only the server may have this.
export function getApiKey(): string {
  return "key-123";
}
