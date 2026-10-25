// The real tide table: the test of app/tides replaces it with `vi.doMock()`.
export async function getHighTide(): Promise<string> {
  return "the time of the real tide table";
}
