export const db = new Map();

export async function getLikes(id: number): Promise<number> {
  return db.get(id) ?? 0;
}
