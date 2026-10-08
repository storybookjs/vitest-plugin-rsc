import type { NextRequest } from "next/server";
import { getReport } from "../../lib/reports.ts";

export async function GET(request: NextRequest) {
  return Response.json(await getReport(Number(request.nextUrl.searchParams.get("year"))));
}
