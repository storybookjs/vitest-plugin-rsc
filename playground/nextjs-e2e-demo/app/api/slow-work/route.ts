import { cookies } from "next/headers";
import { slowWork } from "../../lib/slow-work.ts";

// Works for a while before it answers, and reads the request after that.
export async function POST() {
  slowWork.started += 1;
  await new Promise((resolve) => setTimeout(resolve, slowWork.duration));
  const session = (await cookies()).get("session")?.value;
  slowWork.finished += 1;
  return Response.json({ session });
}
