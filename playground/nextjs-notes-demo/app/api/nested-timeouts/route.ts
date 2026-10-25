// For test/speed-features.test.tsx: how long server code waits for 30
// timeouts of 0, each started by the one before, in ms.
export async function GET() {
  const start = performance.now();
  for (let depth = 0; depth < 30; depth++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return Response.json({ ms: performance.now() - start });
}
