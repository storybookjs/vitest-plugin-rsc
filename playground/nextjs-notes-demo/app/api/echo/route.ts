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

// The fields of a form as the page sent them, a file among them.
export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  return Response.json({
    method: "POST",
    title: form.get("title"),
    file: file instanceof File ? `${file.name} ${await file.text()}` : "none",
  });
}
