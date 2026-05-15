import { expect, test } from "vitest";
import {
  createNextHttpAccessFallbackError,
  getNextHttpAccessFallbackStatus,
  getNextRedirectUrlFromFlightPayloadText,
  isNextHttpAccessFallbackError,
} from "./flight-payload";

test("reads HTTP fallback digests from React Flight error rows", () => {
  const payload = [
    '0:["$","div",null,{}]',
    '1:E{"digest":"NEXT_HTTP_ERROR_FALLBACK;404"}',
    '2:{"digest":"NEXT_HTTP_ERROR_FALLBACK;403"}',
    "",
  ].join("\n");

  expect(getNextHttpAccessFallbackStatus(payload)).toBe(404);
  expect(isNextHttpAccessFallbackError(createNextHttpAccessFallbackError(403))).toBe(true);
});

test("reads HTTP fallback digests from decoded React errors", () => {
  expect(getNextHttpAccessFallbackStatus(new Error("NEXT_HTTP_ERROR_FALLBACK;403"))).toBe(403);
});

test("reads encoded HTTP fallback digests from React Flight model rows", () => {
  const payload = ['0:["$","div",null,{}]', '3:"$SError: NEXT_HTTP_ERROR_FALLBACK;401"', ""].join(
    "\n",
  );

  expect(getNextHttpAccessFallbackStatus(payload)).toBe(401);
});

test("does not match fallback digests outside React Flight rows", () => {
  const payload = [
    '<script>{"digest":"NEXT_HTTP_ERROR_FALLBACK;404"}</script>',
    '{"digest":"NEXT_HTTP_ERROR_FALLBACK;403"}',
    "",
  ].join("\n");

  expect(getNextHttpAccessFallbackStatus(payload)).toBeUndefined();
});

test("reads redirect digests from React Flight error rows", () => {
  const payload = [
    '0:["$","div",null,{}]',
    '2:E{"digest":"NEXT_REDIRECT;replace;/redirect-target?from=flight;307;"}',
    "",
  ].join("\n");

  expect(getNextRedirectUrlFromFlightPayloadText(payload)).toBe("/redirect-target?from=flight");
});
