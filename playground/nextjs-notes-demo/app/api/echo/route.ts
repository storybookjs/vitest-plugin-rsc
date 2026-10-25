import { cookies } from "next/headers";

// For app/request-probe/page.node.test.tsx: what a request of the page
// brought, as JSON, and two cookies for the next one: one of the response's
// own headers, and one that Next adds to them.
export async function GET(request: Request) {
  (await cookies()).set("next", "seen");
  return Response.json(
    { method: "GET", cookie: request.headers.get("cookie") ?? "none" },
    { headers: { "set-cookie": "echo=seen; Path=/" } },
  );
}

// The fields of a form as the page sent them, read from its bytes. Not with
// `request.formData()`: Node's parser makes a file with the global `File`,
// which in a worker of Node.js is the DOM's, and fails on it (SB-2419).
export async function POST(request: Request) {
  const sent = await request.text();
  const title = /name="title"\r\n\r\n([^\r]*)/.exec(sent)?.[1];
  const file = /filename="([^"]*)"\r\nContent-Type: [^\r]*\r\n\r\n([^\r]*)/.exec(sent);
  return Response.json({
    method: "POST",
    title,
    file: file ? `${file[1]} ${file[2]}` : "none",
  });
}
