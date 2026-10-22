import { readAllPages } from "../../lib/paged-results.ts";

export async function GET() {
  return Response.json(await readAllPages(2));
}
