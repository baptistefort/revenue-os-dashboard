import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeFrenchModelText } from "@/lib/ops-language";

test("retire un fragment d'écriture étrangère sans abîmer la réponse française", () => {
  assert.equal(
    sanitizeFrenchModelText(
      "La visibilité SEO progresse پاسخ de 4,4 % [SEO-SNAPSHOT-20260716].",
    ),
    "La visibilité SEO progresse de 4,4 % [SEO-SNAPSHOT-20260716].",
  );
});

test("conserve les identifiants de sources et les noms de produits", () => {
  assert.equal(
    sanitizeFrenchModelText(
      "Google Search et GBP progressent [GEO-SNAPSHOT-20260716].",
    ),
    "Google Search et GBP progressent [GEO-SNAPSHOT-20260716].",
  );
});
