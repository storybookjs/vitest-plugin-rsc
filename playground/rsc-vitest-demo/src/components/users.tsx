import { Like } from "./like";
import { getAllUsers } from "../lib/api.ts";
import { db, getLikes } from "../lib/db.ts";

export async function Users() {
  async function saveToDb(id: number, count: number) {
    "use server";
    db.set(id, count);
    console.log(`saving that ${id} has ${count} likes`);
  }

  const users = await getAllUsers();
  return (
    <ul>
      {users.map((user) => (
        <ul key={user.id}>
          {user.name}
          <Like likesPromise={getLikes(user.id)} onLike={saveToDb.bind(null, user.id)} />
        </ul>
      ))}
    </ul>
  );
}
