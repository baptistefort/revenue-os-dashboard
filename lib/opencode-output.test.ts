import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import {
  OpenCodeOutputValidationError,
  validateOpenCodeStructuredOutput,
} from "@/lib/opencode-output";

const schema = z.object({
  answer: z.string().min(1),
  sources: z.array(z.string()),
});

test("la sortie structurée native est validée", () => {
  const data = validateOpenCodeStructuredOutput(
    schema,
    { answer: "Réponse", sources: ["VAL-061"] },
    "",
  );
  assert.deepEqual(data, { answer: "Réponse", sources: ["VAL-061"] });
});

test("un JSON texte valide reste utilisable malgré l'absence de structured", () => {
  const data = validateOpenCodeStructuredOutput(
    schema,
    undefined,
    '{"answer":"Réponse depuis le texte","sources":["VAL-061"]}',
  );
  assert.deepEqual(data, {
    answer: "Réponse depuis le texte",
    sources: ["VAL-061"],
  });
});

test("un bloc JSON entouré de texte est extrait sans accepter un schéma invalide", () => {
  const data = validateOpenCodeStructuredOutput(
    schema,
    undefined,
    'Sortie finale : {"answer":"Conforme","sources":[]} fin.',
  );
  assert.deepEqual(data, { answer: "Conforme", sources: [] });

  assert.throws(
    () => validateOpenCodeStructuredOutput(
      schema,
      undefined,
      '{"answer":"","sources":"VAL-061"}',
    ),
    OpenCodeOutputValidationError,
  );
});

test("une sortie vide produit une erreur explicite sans réponse de remplacement", () => {
  assert.throws(
    () => validateOpenCodeStructuredOutput(schema, undefined, ""),
    (error: unknown) => {
      assert.ok(error instanceof OpenCodeOutputValidationError);
      assert.match(error.message, /aucune sortie JSON exploitable/i);
      return true;
    },
  );
});
