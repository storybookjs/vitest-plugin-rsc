type Context = { params: Promise<{ path?: string[] }> };

// The folder a path leads to. Without a path, the root.
export async function GET(_request: Request, { params }: Context) {
  return Response.json({ path: (await params).path ?? [] });
}
