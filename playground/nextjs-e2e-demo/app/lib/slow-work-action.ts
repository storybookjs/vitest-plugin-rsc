"use server";

import { revalidatePath } from "next/cache";
import { slowWork } from "./slow-work.ts";

// Works for a while, and has Next render the page again after that.
export async function workSlowly() {
  slowWork.started += 1;
  await new Promise((resolve) => setTimeout(resolve, slowWork.duration));
  slowWork.finished += 1;
  revalidatePath("/slow-work");
}
