import { getForecast } from "../../lib/weather.ts";

// Streams: what it has right away, the forecast when the service answers.
export function GET() {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode("Today: "));
      controller.enqueue(encoder.encode(await getForecast()));
      controller.close();
    },
  });
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
