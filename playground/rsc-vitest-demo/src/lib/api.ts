export async function getAllUsers() {
  const users: { id: number; name: string }[] = await fetch(api("/users")).then((response) =>
    response.json(),
  );

  return users;
}

export const api = (url: string) => `https://jsonplaceholder.typicode.com${url}`;
