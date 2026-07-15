type RateEntry = { count: number; resetAt: number };

const requestWindows = new Map<string, RateEntry>();

function requestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "local";
}

export function guardPostRequest(request: Request, scope: string, limit: number, windowMs = 60_000) {
  const origin = request.headers.get("origin");
  const expectedOrigin = new URL(request.url).origin;
  if (origin && origin !== expectedOrigin) {
    return Response.json({ error: "origin_not_allowed" }, { status: 403 });
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
