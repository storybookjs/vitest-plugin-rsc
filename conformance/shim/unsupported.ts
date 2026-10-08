// What a test asks for that this runner cannot give it, as opposed to what the
// plugin gets wrong. The runner reads the marker off a failed test and reports
// the test as not applicable, with the reason.
export const unsupportedMarker = "[next-conformance:unsupported]";

export class Unsupported extends Error {
  constructor(reason: string) {
    super(`${unsupportedMarker} ${reason}`);
    this.name = "Unsupported";
  }
}

export function unsupported(reason: string): never {
  throw new Unsupported(reason);
}

export function isUnsupported(error: unknown): error is Unsupported {
  return error instanceof Error && error.message.includes(unsupportedMarker);
}
