import { db } from "../lib/notes.ts";

async function upload(formData: FormData) {
  "use server";
  const file = formData.get("file") as File;
  db.notes.set(file.name, { id: file.name, title: file.name, body: await file.text() });
}

export default function UploadPage() {
  return (
    <form action={upload}>
      <label>
        File <input type="file" name="file" />
      </label>
      <button type="submit">Upload</button>
    </form>
  );
}
