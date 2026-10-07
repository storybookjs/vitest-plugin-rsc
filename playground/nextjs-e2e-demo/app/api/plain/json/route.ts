// The platform's helper for a JSON response.
export function GET() {
  return Response.json({ plain: true }, { headers: { "set-cookie": "plain=json; Path=/" } });
}
