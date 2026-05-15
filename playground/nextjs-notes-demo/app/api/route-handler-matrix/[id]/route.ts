import { type NextRequest, NextResponse, userAgent } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: RouteContext) {
  const mode = request.nextUrl.searchParams.get("mode");
  if (mode === "redirect") {
    return NextResponse.redirect(new URL("/api/route-handler-matrix/redirected", request.url));
  }
  if (mode === "rewrite") {
    return NextResponse.rewrite(new URL("/api/route-handler-matrix/rewritten", request.url));
  }
  if (mode === "stream") {
    return new Response(createRouteHandlerStream(await params), {
      headers: { "content-type": "text/plain" },
    });
  }

  return NextResponse.json({
    id: (await params).id,
    method: "GET",
    query: request.nextUrl.searchParams.get("q"),
    requestCookie: request.cookies.get("route-input")?.value ?? null,
    userAgentBrowser: userAgent(request).browser.name ?? "unknown",
  });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const response = NextResponse.json({
    body: await request.json(),
    id: (await params).id,
    method: "POST",
    requestCookie: request.cookies.get("route-input")?.value ?? null,
  });
  response.cookies.set("route-output", "post", { path: "/" });
  return response;
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  return NextResponse.json({
    id: (await params).id,
    method: "PUT",
    text: await request.text(),
  });
}

export async function PATCH(_request: NextRequest, { params }: RouteContext) {
  return NextResponse.json({
    id: (await params).id,
    method: "PATCH",
  });
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  return NextResponse.json({
    id: (await params).id,
    method: "DELETE",
  });
}

export function HEAD() {
  return new Response(null, {
    headers: { "x-route-handler": "head" },
    status: 204,
  });
}

export function OPTIONS() {
  return new Response(null, {
    headers: { allow: "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS" },
    status: 204,
  });
}

function createRouteHandlerStream({ id }: { id: string }) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`stream ${id} `));
      controller.enqueue(encoder.encode("done"));
      controller.close();
    },
  });
}
