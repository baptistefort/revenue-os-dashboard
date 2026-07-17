import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

function constantTimeEqual(left: string, right: string) {
  return timingSafeEqual(digest(left), digest(right));
}

export function authorizeBasicHeader(
  authorization: string | null,
  expectedUsername: string,
  expectedPassword: string,
) {
  if (!authorization?.startsWith("Basic ")) return false;
  let decoded = "";
  try {
    decoded = Buffer.from(authorization.slice(6).trim(), "base64").toString("utf8");
  } catch {
    return false;
  }
  const separator = decoded.indexOf(":");
  if (separator < 1) return false;
  return constantTimeEqual(decoded.slice(0, separator), expectedUsername)
    && constantTimeEqual(decoded.slice(separator + 1), expectedPassword);
}
