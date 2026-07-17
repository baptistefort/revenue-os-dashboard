const FOREIGN_SCRIPT_PATTERN =
  /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Cyrillic}\p{Script=Devanagari}]+/gu;

/**
 * Removes accidental foreign-script fragments occasionally emitted inside an
 * otherwise French answer. Product names, source identifiers, numbers and
 * Latin-alphabet text are preserved.
 */
export function sanitizeFrenchModelText(value: string) {
  return value
    .replace(FOREIGN_SCRIPT_PATTERN, "")
    .replace(/\s*\?\s*Non\.\s*Réponse\s*:\s*/gi, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.;:!?])/g, "$1")
    .trim();
}
