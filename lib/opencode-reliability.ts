const STREAM_RECOVERABLE_CODES = new Set([
  "opencode_request_failed",
  "opencode_session_busy",
  "opencode_assistant_error",
  "opencode_invalid_structured_output",
  "opencode_timeout",
]);

function nestedRecords(value: unknown, depth = 0): Record<string, unknown>[] {
  if (!value || typeof value !== "object" || depth > 3) return [];
  const record = value as Record<string, unknown>;
  const nested = [record];
  for (const key of ["data", "error", "cause"]) {
    nested.push(...nestedRecords(record[key], depth + 1));
  }
  return nested;
}

/**
 * OpenCode can expose SessionBusyError either as an HTTP 409 or as a typed
 * payload nested by the generated SDK. Keep this detector transport-agnostic
 * so a harmless concurrency rejection is never reported as a memory outage.
 */
export function isOpenCodeSessionBusyError(error: unknown, status?: number) {
  if (status === 409) return true;
  return nestedRecords(error).some((record) => {
    if (record._tag === "SessionBusyError") return true;
    const message = typeof record.message === "string" ? record.message : "";
    return /\bsession\b.*\bbusy\b|\bsessionbusyerror\b/i.test(message);
  });
}

function normalizedAnswer(value: string) {
  return value
    .replaceAll("\0", "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
    .slice(0, 30_000);
}

/**
 * A provider may fail while finalising ancillary JSON fields after the answer
 * itself was already streamed. Recover only a clearly useful answer and never
 * recover cancellations/configuration errors, where continuing would hide a
 * real problem or contradict the user's explicit stop action.
 */
export function recoverableStreamedOpenCodeAnswer(
  code: string,
  streamedAnswer: string,
) {
  if (!STREAM_RECOVERABLE_CODES.has(code)) return null;

  const answer = normalizedAnswer(streamedAnswer);
  const words = answer.match(/[\p{L}\p{N}€%]+/gu) ?? [];
  if (answer.length < 8 || words.length < 2) return null;

  const substantial = answer.length >= 120 || words.length >= 20;
  const cleanEnding = /(?:[.!?…:;%€)\]"'»]|\b(?:oui|non|merci))$/iu.test(answer);
  const visiblyInterrupted = /\b(?:et|ou|de|du|des|a|à|avec|pour|par|sur|que|qui|dont|car|mais|donc|soit|puis)$/iu.test(answer);

  if (!substantial && (!cleanEnding || visiblyInterrupted)) return null;
  return answer;
}

/** A busy prompt was rejected before generation, so one fresh-session retry is safe. */
export function shouldRetryBusyOpenCodeTurn(
  code: string,
  streamedAnswer: string,
  retryCount: number,
) {
  return code === "opencode_session_busy"
    && retryCount === 0
    && normalizedAnswer(streamedAnswer).length === 0;
}

export function speechFromRecoveredOpenCodeAnswer(answer: string) {
  const cleaned = normalizedAnswer(answer)
    .replace(/\[(?:[A-ZÀ-ÖØ-Þ0-9]+(?:-[A-ZÀ-ÖØ-Þ0-9]+)+)\]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (cleaned.length <= 900) return cleaned;

  const preview = cleaned.slice(0, 900);
  const lastSentence = Math.max(
    preview.lastIndexOf(". "),
    preview.lastIndexOf("! "),
    preview.lastIndexOf("? "),
  );
  return `${preview.slice(0, lastSentence >= 180 ? lastSentence + 1 : 897).trim()}…`;
}
