type RateEntry = { count: number; resetAt: number };

const requestWindows = new Map<string, RateEntry>();

function requestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "local";
}

export function guardPostRequest(request: Request, scope: string, limit: number, windowMs = 60_000) {
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const forwardedProtocol = request.headers.get("x-forwarded-proto") || requestUrl.protocol.replace(":", "");
  const allowedOrigins = new Set([requestUrl.origin]);
  if (forwardedHost) allowedOrigins.add(`${forwardedProtocol}://${forwardedHost}`);

  if (origin && !allowedOrigins.has(origin)) {
    let localEquivalent = false;
    try {
      const originUrl = new URL(origin);
      const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
      localEquivalent = process.env.NODE_ENV !== "production"
        && loopbackHosts.has(originUrl.hostname)
        && loopbackHosts.has(requestUrl.hostname)
        && originUrl.port === requestUrl.port;
    } catch {
      localEquivalent = false;
    }
    if (!localEquivalent) return Response.json({ error: "origin_not_allowed" }, { status: 403 });
  }

  const now = Date.now();
  const key = `${scope}:${requestIp(request)}`;
  const current = requestWindows.get(key);
  const entry = !current || current.resetAt <= now
    ? { count: 1, resetAt: now + windowMs }
    : { count: current.count + 1, resetAt: current.resetAt };
  requestWindows.set(key, entry);

  if (requestWindows.size > 2_000) {
    for (const [candidate, value] of requestWindows) {
      if (value.resetAt <= now) requestWindows.delete(candidate);
    }
  }

  if (entry.count > limit) {
    return Response.json(
      { error: "rate_limit_exceeded", retry_after_ms: Math.max(1, entry.resetAt - now) },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(Math.ceil((entry.resetAt - now) / 1_000)),
        },
      },
    );
  }

  return null;
}
