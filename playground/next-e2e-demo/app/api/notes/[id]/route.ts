import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { after, NextResponse, type NextRequest } from "next/server";
import { audit } from "../../../lib/audit.ts";
import { db } from "../../../lib/notes.ts";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const { id } = await params;
  // `/api/notes/latest` is a permalink to the page of the note created last.
  if (id === "latest") redirect(`/notes/${(await cookies()).get("last-created")?.value ?? "1"}`);

  if (id === "broken") throw new Error("The database is down");

  const note = await db.getNote(id);
  if (!note) notFound();

  const response = NextResponse.json({
    note,
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    client: (await headers()).get("x-client"),
  });
  response.cookies.set("last-read", id);
  return response;
}

export async function PUT(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const { title } = (await request.json()) as { title: string };
  const note = { body: "", ...(await db.getNote(id)), id, title };
  db.notes.set(id, note);

  const cookieStore = await cookies();
  cookieStore.set("last-renamed", id);
  return NextResponse.json({ note, editor: cookieStore.get("editor")?.value ?? null });
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  const { id } = await params;
  db.notes.delete(id);
  // Runs once the response has been sent.
  after(() => audit(`deleted note ${id}`));
  return new Response(null, { status: 204 });
}
