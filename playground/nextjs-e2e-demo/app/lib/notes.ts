export type Note = { id: string; title: string; body: string; favorite?: boolean };

// Stands in for a database: tests seed it, spy on it and assert on it directly.
export const db = {
  notes: new Map<string, Note>(),

  async listNotes(): Promise<Note[]> {
    return [...db.notes.values()];
  },

  async getNote(id: string): Promise<Note | undefined> {
    return db.notes.get(id);
  },
};
