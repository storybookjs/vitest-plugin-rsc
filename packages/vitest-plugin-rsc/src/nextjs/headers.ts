import * as edgeCookiesModule from "next/dist/compiled/@edge-runtime/cookies/index.js";
import * as requestCookiesModule from "next/dist/server/web/spec-extension/adapters/request-cookies.js";

const { RequestCookies } = edgeCookiesModule;
const { MutableRequestCookiesAdapter } = requestCookiesModule;

let headersStore = new Headers();
let cookieStore = MutableRequestCookiesAdapter.wrap(new RequestCookies(headersStore));

export const headers = async () => headersStore;
export const cookies = async () => cookieStore;

export function resetHeaders() {
  headersStore = new Headers();
  cookieStore = MutableRequestCookiesAdapter.wrap(new RequestCookies(headersStore));
}
