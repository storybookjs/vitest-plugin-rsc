// Stands in for an auth library: it answers a sign-in with a Response that
// sets the session cookie, for the app to pass on.
export function createSession(user: string): Response {
  return new Response(null, {
    status: 204,
    headers: { "set-cookie": `session=${user}; Path=/; HttpOnly` },
  });
}
