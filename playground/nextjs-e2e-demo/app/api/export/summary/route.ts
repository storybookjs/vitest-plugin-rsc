// Data that a browser shows in place of the page, unless a link downloads it.
export function GET() {
  return Response.json({ notes: 1 });
}
