import { NextResponse, type NextRequest } from "next/server.js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Stops other websites, including DNS-rebinding pages, from driving the local API.
// Requiring JSON forces a CORS preflight, which cross-origin callers fail.
export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase().replace(/:\d+$/, "") ?? "";
  const site = request.headers.get("sec-fetch-site");
  const isJson = request.headers.get("content-type")?.toLowerCase().startsWith("application/json");

  if (!LOCAL_HOSTS.has(host) || (site && site !== "same-origin") || !isJson) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

export const config = { matcher: "/api/:path*" };
