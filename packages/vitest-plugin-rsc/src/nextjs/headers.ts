export { cookies } from "next/dist/server/request/cookies.js";
export { headers } from "next/dist/server/request/headers.js";

export async function draftMode() {
  return {
    isEnabled: false,
    enable() {},
    disable() {},
  };
}
