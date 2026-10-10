export type Note = { id: string; title: string; body: string; likes?: number };

const notes = new Map<string, Note>();

export const db = {
  notes,
  async getNote(id: string): Promise<Note | undefined> {
    return notes.get(id);
  },
};
