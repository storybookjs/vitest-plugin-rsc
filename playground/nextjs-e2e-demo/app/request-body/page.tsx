// What the app's server sends to a service with a body, the ways a client of
// one does, like the AWS SDK's: see request-body.test.tsx.
const stream = (text: string) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });

async function sent(send: (url: string) => Promise<Response>): Promise<string> {
  const url = `${(globalThis as { location?: Location }).location!.origin}/service/body`;
  try {
    return await (await send(url)).text();
  } catch (error) {
    return (error as Error).message;
  }
}

export default async function RequestBodyPage() {
  return (
    <>
      <h1>Request body</h1>
      <p>Init: {await sent((url) => fetch(url, { method: "PUT", body: "init" }))}</p>
      <p>
        Request: {await sent((url) => fetch(new Request(url, { method: "PUT", body: "request" })))}
      </p>
      <p>
        Stream:{" "}
        {await sent((url) =>
          fetch(
            new Request(url, {
              method: "POST",
              body: stream("stream"),
              duplex: "half",
            } as RequestInit),
          ),
        )}
      </p>
    </>
  );
}
