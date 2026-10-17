"use server";

// A Server Action that only a Client Component imports.
export async function double(count: number): Promise<number> {
  return count * 2;
}
