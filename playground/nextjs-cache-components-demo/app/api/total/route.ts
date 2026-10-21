import type { NextRequest } from "next/server";

let runs = 0;

export async function GET(request: NextRequest) {
  const unit = request.nextUrl.searchParams.get("unit") ?? "EUR";
  // A cached function that closes over a value of the request: the value is
  // a part of its key, like an argument.
  async function getTotal(amount: number) {
    "use cache";
    return `${amount} ${unit}, computed ${++runs} times`;
  }
  return Response.json(await getTotal(42));
}
