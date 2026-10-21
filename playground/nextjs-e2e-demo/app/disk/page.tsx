import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { revalidatePath } from "next/cache";

// A file of the server's disk, which a test writes too: see disk.test.tsx.
const file = "/notes/today.txt";

async function save(formData: FormData) {
  "use server";
  await mkdir("/notes", { recursive: true });
  await writeFile(file, String(formData.get("note")));
  revalidatePath("/disk");
}

export default async function DiskPage() {
  const note = fs.existsSync(file) ? await readFile(file, "utf8") : "none";
  return (
    <>
      <h1>Disk</h1>
      <p>Note: {note}</p>
      <form action={save}>
        <label>
          Note <input name="note" />
        </label>
        <button type="submit">Save</button>
      </form>
    </>
  );
}
