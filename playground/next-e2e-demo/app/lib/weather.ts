// Stands in for a service the server calls: tests replace it with vi.mock().
export async function getForecast(): Promise<string> {
  throw new Error("The weather service is not available in tests.");
}
