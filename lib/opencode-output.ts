import { z } from "zod";

type ParsedJson = {
  ok: true;
  value: unknown;
} | {
  ok: false;
};

export class OpenCodeOutputValidationError extends Error {
  readonly issues: readonly unknown[];
  readonly outputPreview?: string;

  constructor(
    message: string,
    issues: readonly unknown[] = [],
    outputPreview?: string,
  ) {
    super(message);
    this.name = "OpenCodeOutputValidationError";
    this.issues = issues;
    this.outputPreview = outputPreview;
  }
}

function tryParseJson(value: string): ParsedJson {
  try {
    return { ok: true, value: JSON.parse(value) as unknown };
  } catch {
    return { ok: false };
  }
}

function extractBalancedJson(value: string): ParsedJson {
  for (let start = 0; start < value.length; start += 1) {
    const opening = value[start];
    if (opening !== "{" && opening !== "[") continue;

    const stack: string[] = [];
    let inString = false;
    let escaped = false;

    for (let index = start; index < value.length; index += 1) {
      const character = value[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === "\"") {
          inString = false;
        }
        continue;
      }

      if (character === "\"") {
        inString = true;
        continue;
      }
      if (character === "{" || character === "[") {
        stack.push(character);
        continue;
      }
      if (character !== "}" && character !== "]") continue;

      const expectedOpening = character === "}" ? "{" : "[";
      if (stack.pop() !== expectedOpening) break;
      if (stack.length > 0) continue;

      const parsed = tryParseJson(value.slice(start, index + 1));
      if (parsed.ok) return parsed;
      break;
    }
  }
  return { ok: false };
}

function jsonCandidatesFromText(text: string) {
  const candidates: unknown[] = [];
  const trimmed = text.trim();
  if (!trimmed) return candidates;

  const direct = tryParseJson(trimmed);
  if (direct.ok) candidates.push(direct.value);

  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) {
    const parsedFence = tryParseJson(fenced[1].trim());
    if (parsedFence.ok) candidates.push(parsedFence.value);
  }

  const balanced = extractBalancedJson(trimmed);
  if (balanced.ok) candidates.push(balanced.value);
  return candidates;
}

function outputPreview(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact ? compact.slice(0, 500) : undefined;
}

/**
 * OpenCode 1.18 can return schema-valid JSON as a text part while marking the
 * assistant turn with StructuredOutputError. Validate every available payload
 * before allowing that provider error to discard a usable answer.
 */
export function validateOpenCodeStructuredOutput<TSchema extends z.ZodType>(
  schema: TSchema,
  structured: unknown,
  text: string,
): z.output<TSchema> {
  const candidates: unknown[] = [];
  if (structured !== undefined) {
    candidates.push(structured);
    if (typeof structured === "string") {
      const parsedStructured = tryParseJson(structured.trim());
      if (parsedStructured.ok) candidates.push(parsedStructured.value);
    }
  }
  candidates.push(...jsonCandidatesFromText(text));

  let issues: readonly unknown[] = [];
  for (const candidate of candidates) {
    const result = schema.safeParse(candidate);
    if (result.success) return result.data;
    issues = result.error.issues;
  }

  throw new OpenCodeOutputValidationError(
    candidates.length
      ? "OpenCode a répondu, mais le JSON ne respecte pas le schéma OPS."
      : "OpenCode n’a renvoyé aucune sortie JSON exploitable.",
    issues,
    outputPreview(text),
  );
}
