"use server";

// A Server Action of the app, which a page of the app posts to.
export async function like(likes: number): Promise<number> {
  return likes + 1;
}
