"use server";
export async function action(x: number) { return x; }
export async function cached(x: number) {
  "use cache";
  return x;
}
