/**
 * Extracts one JSON string field while a JSON object is still being streamed.
 *
 * The parser deliberately ignores the rest of the object. It only exposes
 * complete JSON escape sequences, so consumers never receive a broken
 * backslash or a partial `\uXXXX` sequence.
 */
export class StreamingJsonStringField {
  private readonly fieldPattern: RegExp;
  private raw = "";
  private decoded = "";

  constructor(field: string) {
    const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    this.fieldPattern = new RegExp(`"${escapedField}"\\s*:\\s*"`, "u");
  }

  get value() {
    return this.decoded;
  }

  push(chunk: string) {
    if (!chunk) return "";
    this.raw += chunk;

    const match = this.fieldPattern.exec(this.raw);
    if (!match || match.index === undefined) return "";

    const start = match.index + match[0].length;
    let safeEnd = start;
    let index = start;

    while (index < this.raw.length) {
      const character = this.raw[index];
      if (character === "\"") break;

      if (character !== "\\") {
        safeEnd = index + 1;
        index += 1;
        continue;
      }

      const escape = this.raw[index + 1];
      if (!escape) break;
      if (escape === "u") {
        const unicode = this.raw.slice(index + 2, index + 6);
        if (unicode.length < 4 || !/^[0-9a-fA-F]{4}$/.test(unicode)) break;
        safeEnd = index + 6;
        index += 6;
        continue;
      }
      if (!/["\\/bfnrt]/.test(escape)) break;
      safeEnd = index + 2;
      index += 2;
    }

    let next = "";
    try {
      next = JSON.parse(`"${this.raw.slice(start, safeEnd)}"`) as string;
    } catch {
      return "";
    }

    if (!next.startsWith(this.decoded)) return "";
    const delta = next.slice(this.decoded.length);
    this.decoded = next;
    return delta;
  }
}
