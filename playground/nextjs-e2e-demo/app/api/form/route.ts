// Reads a form, of either encoding, and says back what was in it.
export async function POST(request: Request) {
  const form = await request.formData();
  return Response.json({
    fields: [...form].map(([name, value]) =>
      typeof value === "string" ? [name, value] : [name, value.name],
    ),
  });
}
