import { NextRequest, NextResponse } from "next/server";
import { authorizeBasicHeader } from "@/lib/basic-auth";

const PUBLIC_OPERATIONAL_PATHS = new Set(["/api/health", "/api/readiness"]);

export function proxy(request: NextRequest) {
  if (PUBLIC_OPERATIONAL_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const username = process.env.OPS_ACCESS_USERNAME?.trim();
  const password = process.env.OPS_ACCESS_PASSWORD?.trim();
  if (!username || !password) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("OPS access is not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (authorizeBasicHeader(request.headers.get("authorization"), username, password)) {
    return NextResponse.next();
  }

  return new NextResponse("Authentification requise.", {
    status: 401,
    headers: {
      "Cache-Control": "no-store",
      "WWW-Authenticate": 'Basic realm="OPS", charset="UTF-8"',
    },
  });
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
