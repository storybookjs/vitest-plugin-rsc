// Asks its own app by a path alone, which a server has no page to resolve
// against, and says back what its `fetch` made of that.
export async function GET() {
  try {
    const response = await fetch("/api/echo/relative");
    return Response.json({ status: response.status });
  } catch (error) {
    return Response.json({ error: String(error) });
  }
}
